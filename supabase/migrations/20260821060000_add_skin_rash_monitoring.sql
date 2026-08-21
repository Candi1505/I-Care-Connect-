-- Florence participant skin/rash monitoring and private progress-photo records.

create table if not exists public.skin_observation_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete restrict,
  reported_by uuid not null constraint skin_observation_reports_reported_by_fkey references public.profiles(id) on delete restrict,
  observed_at timestamptz not null,
  observation_type text not null check (observation_type in ('Routine skin check','Rash present','Follow-up check','Resolved check')),
  body_areas text[] not null default '{}',
  other_body_area text,
  appearance text[] not null default '{}',
  other_appearance text,
  rash_status text not null check (rash_status in ('First observation','Recurring','Improving','Unchanged','Worsening','Resolved')),
  severity text not null check (severity in ('Mild','Moderate','Severe')),
  itch_score smallint not null check (itch_score between 0 and 10),
  pain_score smallint not null check (pain_score between 0 and 10),
  shower_support text not null check (shower_support in ('Completed as part of regular routine','Offered and declined','Not due at this check','Not completed — reason recorded')),
  shower_notes text,
  area_cleansed boolean not null default false,
  area_dried boolean not null default false,
  scratching_prompt text not null check (scratching_prompt in ('Prompted and responded','Prompted — continued scratching','Not scratching — prompt not required','Participant declined prompt')),
  treatment_applied boolean not null default false,
  treatment_name text,
  participant_response text,
  clinician_contact text not null check (clinician_contact in ('Not required','Pharmacist','GP','Nurse','Other health professional','Supervisor only')),
  clinical_advice text,
  red_flags text[] not null default '{}',
  follow_up_required text,
  review_due date,
  photo_consent boolean not null default false,
  photo_paths text[] not null default '{}',
  declaration_confirmed boolean not null default true,
  pin_verified boolean not null default true,
  status text not null default 'Final' check (status = 'Final'),
  signed_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint skin_observation_body_area_required check (cardinality(body_areas) > 0 or nullif(btrim(coalesce(other_body_area,'')),'') is not null),
  constraint skin_observation_appearance_required check (cardinality(appearance) > 0 or nullif(btrim(coalesce(other_appearance,'')),'') is not null),
  constraint skin_observation_treatment_details check (not treatment_applied or nullif(btrim(coalesce(treatment_name,'')),'') is not null),
  constraint skin_observation_photo_consent check (cardinality(photo_paths) = 0 or photo_consent),
  constraint skin_observation_photo_limit check (cardinality(photo_paths) <= 5),
  constraint skin_observation_review_pair check ((reviewed_by is null and reviewed_at is null) or (reviewed_by is not null and reviewed_at is not null))
);

create index if not exists skin_observation_reports_participant_time_idx
  on public.skin_observation_reports(participant_id, observed_at desc);
create index if not exists skin_observation_reports_org_time_idx
  on public.skin_observation_reports(organisation_id, observed_at desc);

alter table public.skin_observation_reports enable row level security;

drop policy if exists skin_observation_reports_select on public.skin_observation_reports;
create policy skin_observation_reports_select
on public.skin_observation_reports
for select
to authenticated
using (
  organisation_id = public.current_org_id()
  and (public."current_role"())::text in ('supervisor','staff')
  and public.can_access_participant(participant_id)
);

revoke all on public.skin_observation_reports from anon, authenticated;
grant select on public.skin_observation_reports to authenticated;

create or replace function public.record_skin_observation(
  p_participant_id uuid,
  p_observed_at timestamptz,
  p_observation_type text,
  p_body_areas text[],
  p_other_body_area text,
  p_appearance text[],
  p_other_appearance text,
  p_rash_status text,
  p_severity text,
  p_itch_score integer,
  p_pain_score integer,
  p_shower_support text,
  p_shower_notes text,
  p_area_cleansed boolean,
  p_area_dried boolean,
  p_scratching_prompt text,
  p_treatment_applied boolean,
  p_treatment_name text,
  p_participant_response text,
  p_clinician_contact text,
  p_clinical_advice text,
  p_red_flags text[],
  p_follow_up_required text,
  p_review_due date,
  p_photo_consent boolean,
  p_photo_paths text[],
  p_pin text,
  p_declaration_confirmed boolean
)
returns public.skin_observation_reports
language plpgsql
security definer
set search_path = public, storage, extensions, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_result public.skin_observation_reports%rowtype;
  v_path text;
  v_prefix text;
  v_timeline_severity text;
  v_action_summary text;
begin
  perform public.require_verified_mfa();

  select * into v_profile
  from public.profiles
  where id = (select auth.uid())
    and active
    and role in ('supervisor','staff');

  if v_profile.id is null then
    raise exception 'Only active Florence workers can sign a skin monitoring report.';
  end if;
  if p_participant_id is null or not public.can_access_participant(p_participant_id) then
    raise exception 'Participant access is required.';
  end if;
  if p_observed_at is null then raise exception 'Record the observation date and time.'; end if;
  if p_observed_at > now() + interval '10 minutes' then raise exception 'The observation time cannot be in the future.'; end if;
  if p_observation_type not in ('Routine skin check','Rash present','Follow-up check','Resolved check') then raise exception 'Choose a valid observation type.'; end if;
  if cardinality(coalesce(p_body_areas,'{}')) = 0 and nullif(btrim(coalesce(p_other_body_area,'')),'') is null then raise exception 'Select or describe at least one body area.'; end if;
  if cardinality(coalesce(p_appearance,'{}')) = 0 and nullif(btrim(coalesce(p_other_appearance,'')),'') is null then raise exception 'Record what the skin looked like.'; end if;
  if p_rash_status not in ('First observation','Recurring','Improving','Unchanged','Worsening','Resolved') then raise exception 'Choose a valid rash status.'; end if;
  if p_severity not in ('Mild','Moderate','Severe') then raise exception 'Choose a valid severity.'; end if;
  if p_itch_score not between 0 and 10 or p_pain_score not between 0 and 10 then raise exception 'Itch and pain scores must be between 0 and 10.'; end if;
  if p_shower_support not in ('Completed as part of regular routine','Offered and declined','Not due at this check','Not completed — reason recorded') then raise exception 'Choose a valid shower or wash outcome.'; end if;
  if p_shower_support = 'Not completed — reason recorded' and nullif(btrim(coalesce(p_shower_notes,'')),'') is null then raise exception 'Record why shower or wash support was not completed.'; end if;
  if p_scratching_prompt not in ('Prompted and responded','Prompted — continued scratching','Not scratching — prompt not required','Participant declined prompt') then raise exception 'Choose a valid scratching prompt outcome.'; end if;
  if p_treatment_applied and nullif(btrim(coalesce(p_treatment_name,'')),'') is null then raise exception 'Record the exact product or cream applied.'; end if;
  if p_clinician_contact not in ('Not required','Pharmacist','GP','Nurse','Other health professional','Supervisor only') then raise exception 'Choose a valid contact or escalation option.'; end if;
  if cardinality(coalesce(p_red_flags,'{}')) > 0 and nullif(btrim(coalesce(p_follow_up_required,'')),'') is null then raise exception 'Record the action and follow-up for the signs needing review.'; end if;
  if cardinality(coalesce(p_photo_paths,'{}')) > 5 then raise exception 'Attach no more than five progress photos.'; end if;
  if cardinality(coalesce(p_photo_paths,'{}')) > 0 and not coalesce(p_photo_consent,false) then raise exception 'Record the participant’s consent before attaching progress photos.'; end if;

  v_prefix := v_profile.organisation_id::text || '/skin-rash-photos/' || p_participant_id::text || '/' || v_profile.id::text || '/';
  foreach v_path in array coalesce(p_photo_paths,'{}') loop
    if left(v_path,length(v_prefix)) <> v_prefix
       or not exists (
         select 1 from storage.objects object_record
         where object_record.bucket_id = 'florence-private'
           and object_record.name = v_path
           and object_record.owner_id = v_profile.id::text
           and coalesce(object_record.metadata->>'mimetype','') like 'image/%'
       ) then
      raise exception 'A progress photo could not be securely verified.';
    end if;
  end loop;

  if not coalesce(p_declaration_confirmed,false) then raise exception 'Confirm that this skin monitoring report is true and correct.'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$'
     or v_profile.medication_pin_hash is null
     or crypt(p_pin,v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'The signing PIN is incorrect.';
  end if;

  insert into public.skin_observation_reports (
    organisation_id, participant_id, reported_by, observed_at, observation_type,
    body_areas, other_body_area, appearance, other_appearance, rash_status, severity,
    itch_score, pain_score, shower_support, shower_notes, area_cleansed, area_dried,
    scratching_prompt, treatment_applied, treatment_name, participant_response,
    clinician_contact, clinical_advice, red_flags, follow_up_required, review_due,
    photo_consent, photo_paths, declaration_confirmed, pin_verified
  ) values (
    v_profile.organisation_id, p_participant_id, v_profile.id, p_observed_at, p_observation_type,
    coalesce(p_body_areas,'{}'), nullif(btrim(coalesce(p_other_body_area,'')),''),
    coalesce(p_appearance,'{}'), nullif(btrim(coalesce(p_other_appearance,'')),''),
    p_rash_status, p_severity, p_itch_score, p_pain_score, p_shower_support,
    nullif(btrim(coalesce(p_shower_notes,'')),''), coalesce(p_area_cleansed,false),
    coalesce(p_area_dried,false), p_scratching_prompt, coalesce(p_treatment_applied,false),
    nullif(btrim(coalesce(p_treatment_name,'')),''), nullif(btrim(coalesce(p_participant_response,'')),''),
    p_clinician_contact, nullif(btrim(coalesce(p_clinical_advice,'')),''),
    coalesce(p_red_flags,'{}'), nullif(btrim(coalesce(p_follow_up_required,'')),''),
    p_review_due, coalesce(p_photo_consent,false), coalesce(p_photo_paths,'{}'), true, true
  ) returning * into v_result;

  v_timeline_severity := case p_severity when 'Severe' then 'High' when 'Moderate' then 'Moderate' else 'Low' end;
  v_action_summary := concat_ws(' · ',
    'Shower/wash: ' || p_shower_support,
    case when p_area_cleansed then 'Area cleansed' end,
    case when p_area_dried then 'Area dried' end,
    case when p_treatment_applied then 'Product recorded: ' || btrim(p_treatment_name) end,
    'Scratching support: ' || p_scratching_prompt,
    'Contact: ' || p_clinician_contact
  );

  insert into public.client_timeline (
    organisation_id, participant_id, event_type, severity, occurred_at,
    title, description, action_taken, follow_up, created_by
  ) values (
    v_profile.organisation_id, p_participant_id, 'Health', v_timeline_severity, p_observed_at,
    'Skin/rash monitoring — ' || p_rash_status,
    'Areas: ' || array_to_string(coalesce(p_body_areas,'{}'), ', ')
      || case when nullif(btrim(coalesce(p_other_body_area,'')),'') is not null then ', ' || btrim(p_other_body_area) else '' end
      || '. Appearance: ' || array_to_string(coalesce(p_appearance,'{}'), ', ')
      || '. Signed skin report: ' || v_result.id::text || '.',
    v_action_summary,
    nullif(btrim(coalesce(p_follow_up_required,'')),''),
    v_profile.id
  );

  perform public.record_access_event(
    'INSERT', 'skin_observation_reports', v_result.id::text,
    jsonb_build_object('participant_id',p_participant_id,'severity',p_severity,'photo_count',cardinality(coalesce(p_photo_paths,'{}')))
  );
  return v_result;
end;
$$;

revoke all on function public.record_skin_observation(uuid,timestamptz,text,text[],text,text[],text,text,text,integer,integer,text,text,boolean,boolean,text,boolean,text,text,text,text,text[],text,date,boolean,text[],text,boolean) from public, anon;
grant execute on function public.record_skin_observation(uuid,timestamptz,text,text[],text,text[],text,text,text,integer,integer,text,text,boolean,boolean,text,boolean,text,text,text,text,text[],text,date,boolean,text[],text,boolean) to authenticated;

drop policy if exists skin_rash_photos_insert on storage.objects;
create policy skin_rash_photos_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'florence-private'
  and coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
  and array_length(storage.foldername(name),1) = 4
  and (storage.foldername(name))[1] = public.current_org_id()::text
  and (storage.foldername(name))[2] = 'skin-rash-photos'
  and (storage.foldername(name))[4] = (select auth.uid())::text
  and (public."current_role"())::text in ('supervisor','staff')
  and public.can_access_participant(((storage.foldername(name))[3])::uuid)
);

drop policy if exists skin_rash_photos_read on storage.objects;
create policy skin_rash_photos_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'florence-private'
  and coalesce(auth.jwt()->>'aal','aal1') = 'aal2'
  and exists (
    select 1
    from public.skin_observation_reports report
    where objects.name = any(report.photo_paths)
      and report.organisation_id = public.current_org_id()
      and (public."current_role"())::text in ('supervisor','staff')
      and public.can_access_participant(report.participant_id)
  )
);

drop policy if exists skin_rash_photos_delete_unattached on storage.objects;
create policy skin_rash_photos_delete_unattached
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'florence-private'
  and array_length(storage.foldername(name),1) = 4
  and (storage.foldername(name))[1] = public.current_org_id()::text
  and (storage.foldername(name))[2] = 'skin-rash-photos'
  and (storage.foldername(name))[4] = (select auth.uid())::text
  and not exists (
    select 1 from public.skin_observation_reports report
    where objects.name = any(report.photo_paths)
  )
);

drop trigger if exists skin_observation_reports_audit on public.skin_observation_reports;
create trigger skin_observation_reports_audit
after insert or update or delete on public.skin_observation_reports
for each row execute function public.audit_row_change();

comment on table public.skin_observation_reports is 'Signed participant skin and rash monitoring records with private progress-photo references; separate from incident reports.';
