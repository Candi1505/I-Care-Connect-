-- Florence SIL schema and PostgREST cache repair — 1 August 2026
--
-- Purpose:
--   * safely creates the two audited SIL tables if they are absent;
--   * reapplies the SIL validation, RLS, grants and audit triggers;
--   * preserves every existing SIL record and controlled-library PDF;
--   * requests a PostgREST schema-cache reload so the browser API can see the tables.
--
-- Run once in the live I-Care Connect Supabase project pbbsaquwumxyrhqhnobv.
-- This script is idempotent and may be re-run if the first execution is interrupted.

begin;

do $requirements$
begin
 if to_regclass('public.organisations') is null
    or to_regclass('public.profiles') is null
    or to_regclass('public.participants') is null
    or to_regclass('public.audit_events') is null
    or to_regprocedure('public.current_org_id()') is null
    or to_regprocedure('public.current_role()') is null
    or to_regprocedure('public.is_supervisor()') is null
    or to_regprocedure('public.can_access_participant(uuid)') is null
    or to_regprocedure('public.audit_row_change()') is null
    or to_regprocedure('public.touch_updated_at()') is null then
  raise exception 'Florence prerequisites are missing. Do not continue: run the earlier Florence hardening migrations first.';
 end if;
end;
$requirements$;

create table if not exists public.sil_records(
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid references public.participants(id) on delete restrict,
 staff_id uuid references public.profiles(id) on delete set null,
 record_type text not null,
 category text not null,
 title text not null,
 fields jsonb not null default '{}'::jsonb,
 status text not null default 'Complete',
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_by uuid references public.profiles(id) on delete set null,
 updated_at timestamptz not null default now(),
 archived_by uuid references public.profiles(id) on delete set null,
 archived_at timestamptz,
 constraint sil_records_fields_object check(jsonb_typeof(fields)='object'),
 constraint sil_records_status_check check(status in('Complete','Needs confirmation','Draft','Archived')),
 constraint sil_records_type_check check(record_type in(
  'house','safeguarding','meeting','houseRules','visitor','communication','instructions',
  'choice','agreementExplanation','serviceAgreement','rights','privateSpace','handover',
  'induction','competency','training','observation'
 )),
 constraint sil_records_archive_consistent check(
  (archived_at is null and archived_by is null)
  or (archived_at is not null and archived_by is not null and status='Archived')
 )
);

create index if not exists sil_records_org_date_idx
 on public.sil_records(organisation_id,created_at desc);
create index if not exists sil_records_participant_idx
 on public.sil_records(participant_id,created_at desc)
 where participant_id is not null;
create index if not exists sil_records_staff_idx
 on public.sil_records(staff_id,created_at desc)
 where staff_id is not null;

create table if not exists public.sil_provider_profiles(
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null unique references public.organisations(id) on delete cascade,
 profile jsonb not null default '{}'::jsonb,
 updated_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint sil_provider_profile_object check(jsonb_typeof(profile)='object')
);

-- Fail safely rather than silently accepting an unexpected partial table.
do $column_check$
begin
 if not exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name='sil_records' and column_name='archived_at'
 ) or not exists(
  select 1 from information_schema.columns
  where table_schema='public' and table_name='sil_provider_profiles' and column_name='profile'
 ) then
  raise exception 'An incomplete SIL table already exists. No repair was committed; review the live schema before proceeding.';
 end if;
end;
$column_check$;

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
 participant_types constant text[]:=array[
  'visitor','communication','instructions','choice','agreementExplanation',
  'serviceAgreement','rights','privateSpace','handover'
 ];
 worker_types constant text[]:=array['induction','competency','training','observation'];
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
 if octet_length(new.fields::text)>262144 then
  raise exception 'The SIL record is too large';
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

create or replace function public.validate_sil_provider_profile()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
begin
 select * into v_profile from public.profiles where id=new.updated_by and active=true;
 if v_profile.id is null or v_profile.role::text<>'supervisor' or v_profile.organisation_id<>new.organisation_id then
  raise exception 'The SIL provider profile must be signed by an active supervisor in this organisation';
 end if;
 if auth.uid() is not null and new.updated_by<>auth.uid() then
  raise exception 'The signed-in supervisor must sign the SIL provider profile update';
 end if;
 if octet_length(new.profile::text)>262144 then
  raise exception 'The SIL provider profile is too large';
 end if;
 new.updated_at=now();
 return new;
end;
$$;

drop trigger if exists sil_records_validate on public.sil_records;
create trigger sil_records_validate
before insert or update on public.sil_records
for each row execute function public.validate_sil_record();

drop trigger if exists sil_records_touch_updated_at on public.sil_records;
create trigger sil_records_touch_updated_at
before update on public.sil_records
for each row execute function public.touch_updated_at();

drop trigger if exists sil_provider_profiles_touch_updated_at on public.sil_provider_profiles;
create trigger sil_provider_profiles_touch_updated_at
before update on public.sil_provider_profiles
for each row execute function public.touch_updated_at();

drop trigger if exists sil_provider_profiles_validate on public.sil_provider_profiles;
create trigger sil_provider_profiles_validate
before insert or update on public.sil_provider_profiles
for each row execute function public.validate_sil_provider_profile();

alter table public.sil_records enable row level security;
alter table public.sil_provider_profiles enable row level security;

drop policy if exists sil_records_supervisor_all on public.sil_records;
drop policy if exists sil_records_staff_select on public.sil_records;
drop policy if exists sil_records_staff_insert on public.sil_records;
drop policy if exists sil_records_mfa_required on public.sil_records;

create policy sil_records_supervisor_all on public.sil_records
 for all to authenticated
 using(public.is_supervisor() and organisation_id=public.current_org_id())
 with check(public.is_supervisor() and organisation_id=public.current_org_id());

create policy sil_records_staff_select on public.sil_records
 for select to authenticated
 using(
  public.current_role()='staff'
  and organisation_id=public.current_org_id()
  and archived_at is null
  and (
   (participant_id is not null and public.can_access_participant(participant_id))
   or staff_id=auth.uid()
   or created_by=auth.uid()
  )
 );

create policy sil_records_staff_insert on public.sil_records
 for insert to authenticated
 with check(
  public.current_role()='staff'
  and organisation_id=public.current_org_id()
  and created_by=auth.uid()
  and record_type in('visitor','choice','handover')
  and participant_id is not null
  and public.can_access_participant(participant_id)
 );

create policy sil_records_mfa_required on public.sil_records
 as restrictive for all to authenticated
 using(coalesce(auth.jwt()->>'aal','aal1')='aal2')
 with check(coalesce(auth.jwt()->>'aal','aal1')='aal2');

drop policy if exists sil_provider_profiles_select on public.sil_provider_profiles;
drop policy if exists sil_provider_profiles_supervisor_all on public.sil_provider_profiles;
drop policy if exists sil_provider_profiles_mfa_required on public.sil_provider_profiles;

create policy sil_provider_profiles_select on public.sil_provider_profiles
 for select to authenticated
 using(
  organisation_id=public.current_org_id()
  and public.current_role() in('staff','supervisor')
 );

create policy sil_provider_profiles_supervisor_all on public.sil_provider_profiles
 for all to authenticated
 using(public.is_supervisor() and organisation_id=public.current_org_id())
 with check(public.is_supervisor() and organisation_id=public.current_org_id());

create policy sil_provider_profiles_mfa_required on public.sil_provider_profiles
 as restrictive for all to authenticated
 using(coalesce(auth.jwt()->>'aal','aal1')='aal2')
 with check(coalesce(auth.jwt()->>'aal','aal1')='aal2');

revoke all on public.sil_records,public.sil_provider_profiles from anon,authenticated;
grant select,insert,update on public.sil_records to authenticated;
grant select,insert,update on public.sil_provider_profiles to authenticated;

drop trigger if exists sil_records_audit on public.sil_records;
create trigger sil_records_audit
after insert or update or delete on public.sil_records
for each row execute function public.audit_row_change();

drop trigger if exists sil_provider_profiles_audit on public.sil_provider_profiles;
create trigger sil_provider_profiles_audit
after insert or update or delete on public.sil_provider_profiles
for each row execute function public.audit_row_change();

commit;

-- Supabase PostgREST listens for this notification and rebuilds its API schema cache.
notify pgrst, 'reload schema';

select
 case
  when to_regclass('public.sil_records') is null then 'FAIL_SIL_RECORDS_MISSING'
  when to_regclass('public.sil_provider_profiles') is null then 'FAIL_PROVIDER_PROFILE_MISSING'
  when to_regprocedure('public.validate_sil_record()') is null then 'FAIL_VALIDATOR_MISSING'
  when not has_table_privilege('authenticated','public.sil_records','select') then 'FAIL_GRANT_MISSING'
  else 'SIL_SCHEMA_READY_CACHE_RELOAD_SENT'
 end as florence_sil_repair,
 to_regclass('public.sil_records')::text as sil_records_table,
 to_regclass('public.sil_provider_profiles')::text as sil_provider_profiles_table,
 (select count(*) from public.sil_records) as existing_sil_records,
 (select count(*) from public.compliance_documents where category='Controlled library') as private_controlled_documents;
