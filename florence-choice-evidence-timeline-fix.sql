begin;

do $prerequisites$
begin
 if to_regclass('public.sil_records') is null then
  raise exception 'Florence SIL records are not installed';
 end if;
 if to_regclass('public.client_timeline') is null then
  raise exception 'Florence client timeline is not installed';
 end if;
end;
$prerequisites$;

alter table public.client_timeline
 add column if not exists related_sil_record_id uuid
 references public.sil_records(id) on delete set null;

create unique index if not exists client_timeline_sil_record_unique
 on public.client_timeline(related_sil_record_id)
 where related_sil_record_id is not null;

create or replace function public.sync_sil_choice_to_timeline()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_actor_name text;
 v_timeline_id uuid;
 v_title text;
 v_description text;
 v_action text;
 v_follow_up text;
 v_occurred_at timestamptz;
begin
 if new.record_type<>'choice' or new.participant_id is null then
  return new;
 end if;

 select full_name into v_actor_name
 from public.profiles
 where id=new.created_by;

 v_occurred_at:=new.created_at;
 if nullif(btrim(coalesce(new.fields->>'date','')),'') is not null then
  begin
   v_occurred_at:=(new.fields->>'date')::timestamp at time zone 'Australia/Brisbane';
  exception when others then
   v_occurred_at:=new.created_at;
  end;
 end if;

 v_title:='Participant choice — '
  ||coalesce(nullif(btrim(new.fields->>'category'),''),'Daily life');
 v_description:='Choice recorded: '
  ||coalesce(nullif(btrim(new.fields->>'choice'),''),'Completed participant choice form');
 if nullif(btrim(coalesce(new.fields->>'outcome','')),'') is not null then
  v_description:=v_description||'. Outcome: '||btrim(new.fields->>'outcome');
 end if;
 v_action:='Choice and daily-life record completed by '
  ||coalesce(v_actor_name,'authorised worker')||'.';
 v_follow_up:=concat_ws(' · ',
  nullif(btrim(coalesce(new.fields->>'preference_change','')),''),
  nullif(btrim(coalesce(new.fields->>'plan_update','')),'')
 );
 if v_follow_up='' then v_follow_up:=null; end if;

 select id into v_timeline_id
 from public.client_timeline
 where related_sil_record_id=new.id;

 if v_timeline_id is null then
  insert into public.client_timeline(
   organisation_id,participant_id,event_type,severity,occurred_at,title,
   description,action_taken,follow_up,related_sil_record_id,created_by
  ) values(
   new.organisation_id,new.participant_id,'Other','Low',v_occurred_at,v_title,
   v_description,v_action,v_follow_up,new.id,new.created_by
  );
 else
  update public.client_timeline
  set organisation_id=new.organisation_id,
      participant_id=new.participant_id,
      event_type='Other',
      severity='Low',
      occurred_at=v_occurred_at,
      title=v_title,
      description=v_description,
      action_taken=v_action,
      follow_up=v_follow_up
  where id=v_timeline_id;
 end if;
 return new;
end;
$$;

revoke all on function public.sync_sil_choice_to_timeline() from public,anon,authenticated;

drop trigger if exists sil_choice_timeline_sync on public.sil_records;
create trigger sil_choice_timeline_sync
after insert or update on public.sil_records
for each row execute function public.sync_sil_choice_to_timeline();

insert into public.client_timeline(
 organisation_id,participant_id,event_type,severity,occurred_at,title,
 description,action_taken,follow_up,related_sil_record_id,created_by
)
select
 record.organisation_id,
 record.participant_id,
 'Other'::public.timeline_event_type,
 'Low'::public.timeline_severity,
 coalesce(
  case
   when nullif(btrim(coalesce(record.fields->>'date','')),'') is not null
    and (record.fields->>'date') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'
   then (record.fields->>'date')::timestamp at time zone 'Australia/Brisbane'
  end,
  record.created_at
 ),
 'Participant choice — '
  ||coalesce(nullif(btrim(record.fields->>'category'),''),'Daily life'),
 'Choice recorded: '
  ||coalesce(nullif(btrim(record.fields->>'choice'),''),'Completed participant choice form')
  ||case
    when nullif(btrim(coalesce(record.fields->>'outcome','')),'') is not null
    then '. Outcome: '||btrim(record.fields->>'outcome')
    else ''
   end,
 'Choice and daily-life record completed by '
  ||coalesce(actor.full_name,'authorised worker')||'.',
 nullif(concat_ws(' · ',
  nullif(btrim(coalesce(record.fields->>'preference_change','')),''),
  nullif(btrim(coalesce(record.fields->>'plan_update','')),'')
 ),''),
 record.id,
 record.created_by
from public.sil_records record
left join public.profiles actor on actor.id=record.created_by
where record.record_type='choice'
  and record.participant_id is not null
  and record.archived_at is null
  and not exists(
   select 1 from public.client_timeline timeline
   where timeline.related_sil_record_id=record.id
  );

comment on column public.client_timeline.related_sil_record_id is
 'Links participant timeline history to its complete audited SIL form.';
comment on function public.sync_sil_choice_to_timeline() is
 'Keeps participant choice and daily-life records visible in the Florence client timeline.';

notify pgrst,'reload schema';
commit;

select
 case
  when to_regprocedure('public.sync_sil_choice_to_timeline()') is null then 'FAIL_FUNCTION'
  when to_regclass('public.client_timeline_sil_record_unique') is null then 'FAIL_UNIQUE_LINK'
  when exists(
   select 1
   from public.sil_records record
   left join public.client_timeline timeline on timeline.related_sil_record_id=record.id
   where record.record_type='choice'
     and record.participant_id is not null
     and record.archived_at is null
     and timeline.id is null
  ) then 'FAIL_BACKFILL'
  else 'PASS_CHOICE_EVIDENCE_TIMELINE'
 end as result;
