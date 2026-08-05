-- Florence daily SIL service-delivery upgrade — 5 August 2026
--
-- Extends the existing audited SIL record store with the participant plans
-- required for everyday delivery. Existing records and the private document
-- library are preserved.

begin;

do $requirements$
begin
 if to_regclass('public.sil_records') is null
    or to_regprocedure('public.validate_sil_record()') is null
    or to_regprocedure('public.can_access_participant(uuid)') is null then
  raise exception 'Florence SIL prerequisites are missing; no changes were applied';
 end if;
end;
$requirements$;

alter table public.sil_records
 drop constraint if exists sil_records_type_check;

alter table public.sil_records
 add constraint sil_records_type_check check(record_type in(
  'house','safeguarding','meeting','houseRules','visitor',
  'supportPlan','emergencyPlan','riskAssessment','intake',
  'communication','instructions','choice','agreementExplanation',
  'serviceAgreement','rights','privateSpace','handover',
  'induction','competency','training','observation'
 ));

create or replace function public.validate_sil_record()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_creator_org uuid;
 v_participant_org uuid;
 v_staff_org uuid;
 v_role text;
 v_review_date date;
 v_record_date date;
 participant_types constant text[]:=array[
  'visitor','supportPlan','emergencyPlan','riskAssessment','intake',
  'communication','instructions','choice','agreementExplanation',
  'serviceAgreement','rights','privateSpace','handover'
 ];
 worker_types constant text[]:=array['induction','competency','training','observation'];
 annual_review_types constant text[]:=array[
  'supportPlan','emergencyPlan','riskAssessment','communication','instructions'
 ];
begin
 select organisation_id,role::text into v_creator_org,v_role
 from public.profiles where id=new.created_by and active=true;
 if v_creator_org is null or v_creator_org<>new.organisation_id then
  raise exception 'The SIL record creator must be active in this organisation';
 end if;
 if tg_op='INSERT' and auth.uid() is not null and new.created_by<>auth.uid() then
  raise exception 'SIL records must be signed by the person creating them';
 end if;
 if tg_op='UPDATE' then
  new.created_by=old.created_by;
  new.created_at=old.created_at;
 end if;

 if new.record_type=any(participant_types) and new.participant_id is null then
  raise exception 'This SIL record must be linked to a participant';
 end if;
 if new.record_type=any(worker_types) and new.staff_id is null then
  raise exception 'This SIL record must be linked to a worker';
 end if;
 if new.participant_id is not null then
  select organisation_id into v_participant_org
  from public.participants where id=new.participant_id;
  if v_participant_org is null or v_participant_org<>new.organisation_id then
   raise exception 'The SIL participant is not in this organisation';
  end if;
 end if;
 if new.staff_id is not null then
  select organisation_id into v_staff_org
  from public.profiles where id=new.staff_id and active=true;
  if v_staff_org is null or v_staff_org<>new.organisation_id then
   raise exception 'The SIL worker is not active in this organisation';
  end if;
 end if;
 if jsonb_typeof(new.fields)<>'object' or octet_length(new.fields::text)>262144 then
  raise exception 'The SIL record fields are invalid or too large';
 end if;

 if new.record_type=any(annual_review_types) then
  begin
   v_review_date=(new.fields->>'review_date')::date;
   v_record_date=coalesce(
    nullif(new.fields->>'plan_date','')::date,
    nullif(new.fields->>'assessment_date','')::date,
    nullif(new.fields->>'profile_date','')::date,
    nullif(new.fields->>'effective_date','')::date,
    current_date
   );
  exception when others then
   raise exception 'This SIL record requires valid record and review dates';
  end;
  if v_review_date is null or v_review_date<v_record_date or v_review_date>v_record_date+366 then
   raise exception 'The SIL review date must be on or after the record date and no later than 12 months';
  end if;
 end if;
 if new.record_type='choice' and coalesce(new.fields->>'declaration','')<>'Yes' then
  raise exception 'The worker declaration is required for a participant choice record';
 end if;

 if auth.uid() is not null and v_role='staff' then
  if new.record_type not in('visitor','choice','handover') then
   raise exception 'This SIL record type must be completed by a supervisor';
  end if;
  if new.participant_id is null or not public.can_access_participant(new.participant_id) then
   raise exception 'You are not authorised for this participant';
  end if;
 end if;
 new.updated_by=coalesce(auth.uid(),new.updated_by,new.created_by);
 new.updated_at=now();
 return new;
end;
$$;

-- The existing staff insert policy remains deliberately limited to records
-- workers create during delivery. Plans and assessments require a supervisor.
drop policy if exists sil_records_staff_insert on public.sil_records;
create policy sil_records_staff_insert on public.sil_records
 for insert to authenticated
 with check(
  public.current_role()='staff'
  and organisation_id=public.current_org_id()
  and created_by=(select auth.uid())
  and record_type in('visitor','choice','handover')
  and participant_id is not null
  and public.can_access_participant(participant_id)
 );

-- Latest-per-participant coverage and recent shift lookups.
create index if not exists sil_records_org_participant_type_date_idx
 on public.sil_records(organisation_id,participant_id,record_type,created_at desc)
 where participant_id is not null and archived_at is null;

comment on function public.validate_sil_record() is
 'Validates tenant, participant and worker ownership, daily-record authorship, annual review dates and choice declarations for Florence SIL records.';

notify pgrst,'reload schema';
commit;

select
 case
  when not exists(
   select 1 from pg_constraint
   where conrelid='public.sil_records'::regclass
     and conname='sil_records_type_check'
     and pg_get_constraintdef(oid) like '%supportPlan%'
  ) then 'FAIL_RECORD_TYPES'
  when to_regprocedure('public.validate_sil_record()') is null then 'FAIL_VALIDATOR'
  when to_regclass('public.sil_records') is null then 'FAIL_TABLE'
  else 'PASS_DAILY_SERVICE_DELIVERY_SCHEMA'
 end as result;
