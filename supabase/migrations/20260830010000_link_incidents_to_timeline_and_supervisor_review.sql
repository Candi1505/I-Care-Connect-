begin;

alter table public.client_timeline
  add column if not exists related_incident_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.client_timeline'::regclass
      and conname='client_timeline_related_incident_id_fkey'
  ) then
    alter table public.client_timeline
      add constraint client_timeline_related_incident_id_fkey
      foreign key (related_incident_id) references public.incidents(id) on delete set null;
  end if;
end $$;

create unique index if not exists client_timeline_related_incident_id_key
  on public.client_timeline(related_incident_id)
  where related_incident_id is not null;

alter table public.supervisor_reviews
  drop constraint if exists supervisor_reviews_source_type_check;

alter table public.supervisor_reviews
  add constraint supervisor_reviews_source_type_check
  check (source_type=any(array[
    'progress_note'::text,
    'medication_round'::text,
    'community_support'::text,
    'sil_record'::text,
    'domestic_record'::text,
    'cleaner_record'::text,
    'expenditure'::text,
    'incident'::text
  ]));

create or replace function public.sync_incident_workflow()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_timeline_id uuid;
  v_timeline_severity public.timeline_severity;
  v_title text;
  v_summary text;
begin
  if new.participant_id is null or new.reported_by is null then return new; end if;

  v_timeline_severity:=case
    when new.severity in ('Critical','High') then 'High'::public.timeline_severity
    when new.severity='Moderate' then 'Moderate'::public.timeline_severity
    else 'Low'::public.timeline_severity
  end;
  v_title:='Incident · '||coalesce(nullif(btrim(new.category),''),'Other');

  select id into v_timeline_id
  from public.client_timeline
  where related_incident_id=new.id;

  if v_timeline_id is null then
    insert into public.client_timeline(
      organisation_id,participant_id,event_type,severity,occurred_at,title,
      description,action_taken,follow_up,related_incident_id,created_by
    ) values(
      new.organisation_id,new.participant_id,'Incident'::public.timeline_event_type,
      v_timeline_severity,new.occurred_at,v_title,new.description,new.immediate_actions,
      null,new.id,new.reported_by
    );
  else
    update public.client_timeline
    set organisation_id=new.organisation_id,
        participant_id=new.participant_id,
        event_type='Incident'::public.timeline_event_type,
        severity=v_timeline_severity,
        occurred_at=new.occurred_at,
        title=v_title,
        description=new.description,
        action_taken=new.immediate_actions,
        updated_at=now()
    where id=v_timeline_id;
  end if;

  v_summary:=concat_ws(E'\n',
    'Severity: '||coalesce(new.severity,'Not recorded'),
    case when nullif(btrim(coalesce(new.location,'')),'') is not null then 'Location: '||btrim(new.location) end,
    new.description,
    case when nullif(btrim(coalesce(new.immediate_actions,'')),'') is not null then 'Immediate actions: '||btrim(new.immediate_actions) end
  );

  insert into public.supervisor_reviews(
    organisation_id,participant_id,source_key,source_type,source_ids,title,summary,
    submitted_by,submitted_at,metadata
  ) values(
    new.organisation_id,new.participant_id,'incident:'||new.id::text,'incident',array[new.id],
    v_title,v_summary,new.reported_by,coalesce(new.created_at,now()),
    jsonb_build_object('record_table','incidents','category',new.category,'severity',new.severity)
  )
  on conflict (organisation_id,source_key) do update
  set title=excluded.title,
      summary=excluded.summary,
      submitted_by=excluded.submitted_by,
      submitted_at=excluded.submitted_at,
      status=case when public.supervisor_reviews.summary is distinct from excluded.summary
                    or public.supervisor_reviews.title is distinct from excluded.title
                  then 'Awaiting review' else public.supervisor_reviews.status end,
      reviewed_by=case when public.supervisor_reviews.summary is distinct from excluded.summary
                         or public.supervisor_reviews.title is distinct from excluded.title
                       then null else public.supervisor_reviews.reviewed_by end,
      reviewed_at=case when public.supervisor_reviews.summary is distinct from excluded.summary
                         or public.supervisor_reviews.title is distinct from excluded.title
                       then null else public.supervisor_reviews.reviewed_at end,
      review_note=case when public.supervisor_reviews.summary is distinct from excluded.summary
                         or public.supervisor_reviews.title is distinct from excluded.title
                       then null else public.supervisor_reviews.review_note end,
      metadata=excluded.metadata,
      updated_at=now();

  return new;
end;
$$;

drop trigger if exists incidents_timeline_review_sync on public.incidents;
create trigger incidents_timeline_review_sync
after insert or update of occurred_at,location,category,severity,description,immediate_actions
on public.incidents
for each row execute function public.sync_incident_workflow();

comment on function public.sync_incident_workflow() is
  'Keeps incident reports visible in the participant timeline and supervisor review queue.';

commit;
