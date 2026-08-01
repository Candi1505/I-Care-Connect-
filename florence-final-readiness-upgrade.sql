-- Florence final readiness upgrade — 1 August 2026
-- Non-destructive for production records. This migration:
--   * moves SIL operational records out of browser localStorage and into audited Supabase tables;
--   * makes clock-in and clock-out server-timestamped and prevents worker-side time editing;
--   * limits family/participant accounts to the secure portal rather than clinical staff records;
--   * removes the known pre-production Mary Jane / Sifrol test records after strict safety checks.
-- Run once after all earlier Florence hardening and controlled-library migrations.

begin;

do $requirements$
begin
 if to_regclass('public.profiles') is null
    or to_regclass('public.participants') is null
    or to_regclass('public.timesheets') is null
    or to_regclass('public.audit_events') is null
    or to_regprocedure('public.require_verified_mfa()') is null
    or to_regprocedure('public.can_access_participant(uuid)') is null
    or to_regprocedure('public.audit_row_change()') is null then
  raise exception 'Run the Florence audit, operational and production-hardening migrations before this final readiness upgrade';
 end if;
end;
$requirements$;

-- =========================================================
-- 1. SERVER-CONTROLLED TIME AND ATTENDANCE
-- =========================================================

alter table public.timesheets add column if not exists work_type text;
alter table public.timesheets add column if not exists clock_in_notes text;
alter table public.timesheets add column if not exists clock_out_notes text;

update public.timesheets
set work_type=nullif(btrim((regexp_match(coalesce(notes,''),'(?im)^Work type:\s*(.+)$'))[1]),'')
where work_type is null
  and coalesce(notes,'') ~* '(?m)^Work type:';

do $work_type_constraint$
begin
 if not exists(
  select 1 from pg_constraint
  where conrelid='public.timesheets'::regclass
    and conname='timesheets_work_type_check'
 ) then
  alter table public.timesheets
   add constraint timesheets_work_type_check check(
    work_type is null or work_type in(
     'Participant support','24-hour support','Personal care','Community access',
     'Social support','Sleepover','Active night','Transport','Domestic assistance',
     'Administration / office work','Training / staff meeting','On-call / coordination','Other'
    )
   );
 end if;
end;
$work_type_constraint$;

do $open_timesheet_check$
declare duplicate_count integer;
begin
 select count(*) into duplicate_count
 from(
  select staff_id
  from public.timesheets
  where clock_out is null and status='Open'
  group by staff_id
  having count(*)>1
 ) duplicate_workers;
 if duplicate_count>0 then
  raise exception 'Resolve duplicate open timesheets before running the final readiness upgrade';
 end if;
end;
$open_timesheet_check$;

create unique index if not exists timesheets_one_open_per_worker
 on public.timesheets(staff_id)
 where clock_out is null and status='Open';

-- Remove direct worker writes. Supervisors retain the existing supervisor policy;
-- workers use the controlled RPCs below so timestamps come from the database.
drop policy if exists timesheets_own_insert on public.timesheets;
drop policy if exists timesheets_own_update on public.timesheets;
drop policy if exists timesheets_staff_insert on public.timesheets;
drop policy if exists timesheets_staff_update on public.timesheets;

drop policy if exists timesheets_own_select on public.timesheets;
create policy timesheets_own_select on public.timesheets
 for select to authenticated
 using(
  organisation_id=public.current_org_id()
  and (staff_id=auth.uid() or public.is_supervisor())
 );

create or replace function public.clock_in_timesheet(
 p_shift_id uuid default null,
 p_work_type text default 'Participant support',
 p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_shift public.shifts%rowtype;
 v_id uuid;
 v_note text;
begin
 perform public.require_verified_mfa();
 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true and role in('staff','supervisor');
 if v_profile.id is null then
  raise exception 'Only active workers and supervisors can clock in';
 end if;
 if p_work_type not in(
  'Participant support','24-hour support','Personal care','Community access',
  'Social support','Sleepover','Active night','Transport','Domestic assistance',
  'Administration / office work','Training / staff meeting','On-call / coordination','Other'
 ) then
  raise exception 'Select a valid Florence work type';
 end if;
 if exists(
  select 1 from public.timesheets
  where staff_id=v_profile.id and clock_out is null and status='Open'
 ) then
  raise exception 'You are already clocked in';
 end if;

 if p_shift_id is not null then
  select * into v_shift
  from public.shifts
  where id=p_shift_id
    and organisation_id=v_profile.organisation_id
    and assigned_staff_id=v_profile.id
    and status='Published';
  if v_shift.id is null then
   raise exception 'The selected roster shift is not assigned and available to this worker';
  end if;
  if clock_timestamp()<v_shift.starts_at-interval '12 hours'
     or clock_timestamp()>v_shift.ends_at+interval '12 hours' then
   raise exception 'This roster shift is outside the permitted clock-in window';
  end if;
 end if;

 v_note='Work type: '||p_work_type;
 if nullif(btrim(coalesce(p_notes,'')),'') is not null then
  v_note=v_note||E'\n'||left(btrim(p_notes),2000);
 end if;

 insert into public.timesheets(
  organisation_id,staff_id,shift_id,clock_in,break_minutes,work_type,
  clock_in_notes,notes,status
 ) values(
  v_profile.organisation_id,v_profile.id,p_shift_id,clock_timestamp(),0,p_work_type,
  nullif(left(btrim(coalesce(p_notes,'')),2000),''),v_note,'Open'
 ) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.clock_in_timesheet(uuid,text,text) from public;
grant execute on function public.clock_in_timesheet(uuid,text,text) to authenticated;

create or replace function public.clock_out_timesheet(
 p_break_minutes integer default 0,
 p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_timesheet public.timesheets%rowtype;
 v_finish timestamptz:=clock_timestamp();
 v_elapsed_minutes integer;
 v_notes text;
begin
 perform public.require_verified_mfa();
 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true and role in('staff','supervisor');
 if v_profile.id is null then
  raise exception 'Only active workers and supervisors can clock out';
 end if;

 select * into v_timesheet
 from public.timesheets
 where organisation_id=v_profile.organisation_id
   and staff_id=v_profile.id
   and clock_out is null
   and status='Open'
 order by clock_in desc
 limit 1
 for update;
 if v_timesheet.id is null then
  raise exception 'No open Florence timesheet was found';
 end if;
 if coalesce(p_break_minutes,0)<0 then
  raise exception 'Break minutes cannot be negative';
 end if;
 v_elapsed_minutes=floor(extract(epoch from(v_finish-v_timesheet.clock_in))/60);
 if coalesce(p_break_minutes,0)>greatest(v_elapsed_minutes,0) then
  raise exception 'Break minutes cannot exceed the total time worked';
 end if;

 v_notes='Work type: '||coalesce(v_timesheet.work_type,'Work shift');
 if nullif(btrim(coalesce(v_timesheet.clock_in_notes,'')),'') is not null then
  v_notes=v_notes||E'\n'||btrim(v_timesheet.clock_in_notes);
 end if;
 if nullif(btrim(coalesce(p_notes,'')),'') is not null then
  v_notes=v_notes||E'\nClock-out note: '||left(btrim(p_notes),2000);
 end if;

 update public.timesheets
 set clock_out=v_finish,
     break_minutes=coalesce(p_break_minutes,0),
     clock_out_notes=nullif(left(btrim(coalesce(p_notes,'')),2000),''),
     notes=v_notes,
     status='Submitted',
     updated_at=now()
 where id=v_timesheet.id;
 return v_timesheet.id;
end;
$$;
revoke all on function public.clock_out_timesheet(integer,text) from public;
grant execute on function public.clock_out_timesheet(integer,text) to authenticated;

-- =========================================================
-- 2. AUDITED SIL OPERATIONAL RECORDS (NO BROWSER LOCALSTORAGE)
-- =========================================================

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
 v_role public.app_role;
 participant_types constant text[]:=array[
  'visitor','communication','instructions','choice','agreementExplanation',
  'serviceAgreement','rights','privateSpace','handover'
 ];
 worker_types constant text[]:=array['induction','competency','training','observation'];
begin
 select organisation_id,role into v_creator_org,v_role
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

-- =========================================================
-- 3. PORTAL LEAST-PRIVILEGE BOUNDARY
-- =========================================================

-- Family and participant accounts are secure portal accounts. They may see their
-- linked participant identity and portal messages, but not raw clinical, MAR,
-- progress-note, timeline, incident, funding or staff compliance records.
drop policy if exists participants_select on public.participants;
create policy participants_select on public.participants
 for select to authenticated
 using(
  organisation_id=public.current_org_id()
  and (
   public.is_supervisor()
   or (public.current_role()='staff' and public.can_access_participant(id))
   or (public.current_role() in('family','client') and id=public.current_participant_id())
  )
 );

drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts
 for select to authenticated
 using(
  organisation_id=public.current_org_id()
  and (
   public.is_supervisor()
   or (
    public.current_role()='staff'
    and (
     assigned_staff_id=auth.uid()
     or (status='Published' and assigned_staff_id is null)
    )
   )
  )
 );

drop policy if exists medications_select on public.medications;
create policy medications_select on public.medications
 for select to authenticated
 using(
  organisation_id=public.current_org_id()
  and public.current_role() in('staff','supervisor')
  and public.can_access_participant(participant_id)
 );

drop policy if exists mar_select on public.mar_entries;
create policy mar_select on public.mar_entries
 for select to authenticated
 using(
  organisation_id=public.current_org_id()
  and public.current_role() in('staff','supervisor')
  and public.can_access_participant(participant_id)
 );

drop policy if exists notes_select on public.progress_notes;
create policy notes_select on public.progress_notes
 for select to authenticated
 using(
  organisation_id=public.current_org_id()
  and public.current_role() in('staff','supervisor')
  and public.can_access_participant(participant_id)
 );

drop policy if exists timeline_select on public.client_timeline;
create policy timeline_select on public.client_timeline
 for select to authenticated
 using(
  organisation_id=public.current_org_id()
  and public.current_role() in('staff','supervisor')
  and public.can_access_participant(participant_id)
 );

drop policy if exists incidents_org_select on public.incidents;
create policy incidents_org_select on public.incidents
 for select to authenticated
 using(
  organisation_id=public.current_org_id()
  and public.current_role() in('staff','supervisor')
  and (public.is_supervisor() or (participant_id is not null and public.can_access_participant(participant_id)))
 );

do $participant_table_policies$
declare table_name text;
begin
 foreach table_name in array array[
  'medication_incidents','emergency_plans','participant_goals','funding_plans','controlled_drug_register'
 ] loop
  if to_regclass(format('public.%I',table_name)) is not null then
   execute format('drop policy if exists %I_org_select on public.%I',table_name,table_name);
   execute format(
    'create policy %I_org_select on public.%I for select to authenticated using (organisation_id=public.current_org_id() and public.current_role() in (''staff'',''supervisor'') and public.can_access_participant(participant_id))',
    table_name,table_name
   );
  end if;
 end loop;
end;
$participant_table_policies$;

-- Controlled-document metadata and file reads remain supervisor/all-worker
-- scoped as previously hardened, but portal accounts are not included.
drop policy if exists compliance_select on public.compliance_documents;
create policy compliance_select
on public.compliance_documents
for select to authenticated
using(
 organisation_id=public.current_org_id()
 and (
  public.is_supervisor()
  or (
   scope='Organisation'
   and public.current_role()='staff'
   and (
    category is distinct from 'Controlled library'
    or public.is_worker_controlled_document(title)
   )
  )
  or (scope='Staff' and subject_id=auth.uid())
  or (
   scope='Participant'
   and public.current_role()='staff'
   and public.can_access_participant(subject_id)
  )
 )
);

drop policy if exists florence_storage_read on storage.objects;
create policy florence_storage_read
on storage.objects
for select to authenticated
using(
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and (
  (
   public.is_supervisor()
   and (storage.foldername(name))[1]=public.current_org_id()::text
  )
  or exists(
   select 1
   from public.compliance_documents document_record
   where document_record.storage_path=name
     and document_record.organisation_id=public.current_org_id()
     and (
      (
       document_record.scope='Organisation'
       and public.current_role()='staff'
       and (
        document_record.category is distinct from 'Controlled library'
        or public.is_worker_controlled_document(document_record.title)
       )
      )
      or (document_record.scope='Staff' and document_record.subject_id=auth.uid())
      or (
       document_record.scope='Participant'
       and public.current_role()='staff'
       and public.can_access_participant(document_record.subject_id)
      )
     )
  )
 )
);

-- =========================================================
-- 4. STRICT PRE-PRODUCTION TEST-DATA REMOVAL
-- =========================================================

do $remove_known_test_data$
declare
 v_participant_id uuid;
 v_participant_org uuid;
 v_participant_count integer;
 v_sifrol_count integer;
 v_sifrol_id uuid;
 v_sifrol_participant uuid;
 v_linked_profiles text;
 v_document_count integer;
 v_shift_ids uuid[];
 v_incident_ids uuid[];
 v_complaint_ids uuid[];
begin
 select count(*),min(id),min(organisation_id)
 into v_participant_count,v_participant_id,v_participant_org
 from public.participants
 where lower(btrim(full_name))='mary jane';
 if v_participant_count>1 then
  raise exception 'More than one participant is named Mary Jane. No test data was removed.';
 end if;

 select count(*),min(id),min(participant_id)
 into v_sifrol_count,v_sifrol_id,v_sifrol_participant
 from public.medications
 where lower(btrim(medication_name))='sifrol';
 if v_sifrol_count>1 then
  raise exception 'More than one medication is named Sifrol. No test data was removed.';
 end if;
 if v_sifrol_count=1 and v_participant_id is not null and v_sifrol_participant<>v_participant_id then
  raise exception 'Sifrol belongs to a participant other than Mary Jane. No test data was removed.';
 end if;

 if v_participant_id is not null then
  select string_agg(full_name||' <'||coalesce(email,'no email')||'>',', ')
  into v_linked_profiles
  from public.profiles
  where participant_id=v_participant_id;
  if v_linked_profiles is not null then
   raise exception 'Mary Jane is linked to portal account(s): %. Remove those test accounts through People & access management first.',v_linked_profiles;
  end if;

  select count(*) into v_document_count
  from public.compliance_documents
  where scope='Participant' and subject_id=v_participant_id;
  if v_document_count>0 then
   raise exception 'Mary Jane has % private document(s). Delete those test documents through Florence first so the underlying Storage objects are removed safely.',v_document_count;
  end if;

  select array_agg(id) into v_shift_ids
  from public.shifts where participant_id=v_participant_id;
  if to_regclass('public.incidents') is not null then
   select array_agg(id) into v_incident_ids
   from public.incidents where participant_id=v_participant_id;
  end if;
  if to_regclass('public.complaints') is not null then
   select array_agg(id) into v_complaint_ids
   from public.complaints where participant_id=v_participant_id;
  end if;

  if to_regclass('public.retention_register') is not null then
   delete from public.retention_register
   where organisation_id=v_participant_org
     and (
      (table_name='incidents' and record_id=any(coalesce(v_incident_ids,array[]::uuid[])))
      or (table_name='complaints' and record_id=any(coalesce(v_complaint_ids,array[]::uuid[])))
     );
  end if;
  delete from public.portal_messages
  where thread_id in(select id from public.portal_threads where participant_id=v_participant_id);
  delete from public.portal_threads where participant_id=v_participant_id;
  delete from public.notifications
  where related_record_id=any(coalesce(v_shift_ids,array[]::uuid[]));
  if to_regclass('public.timesheets') is not null then
   delete from public.timesheets
   where shift_id=any(coalesce(v_shift_ids,array[]::uuid[]));
  end if;
  if to_regclass('public.travel_expenses') is not null then
   delete from public.travel_expenses
   where participant_id=v_participant_id
      or shift_id=any(coalesce(v_shift_ids,array[]::uuid[]));
  end if;
  if to_regclass('public.controlled_drug_register') is not null then
   delete from public.controlled_drug_register where participant_id=v_participant_id;
  end if;
  if to_regclass('public.medication_incidents') is not null then
   delete from public.medication_incidents where participant_id=v_participant_id;
  end if;
  delete from public.mar_entries where participant_id=v_participant_id;
  delete from public.client_timeline where participant_id=v_participant_id;
  delete from public.progress_notes where participant_id=v_participant_id;
  if to_regclass('public.sil_records') is not null then
   delete from public.sil_records where participant_id=v_participant_id;
  end if;
  delete from public.shifts where participant_id=v_participant_id;
  if to_regclass('public.participant_access_assignments') is not null then
   delete from public.participant_access_assignments where participant_id=v_participant_id;
  end if;
  if to_regclass('public.emergency_plans') is not null then
   delete from public.emergency_plans where participant_id=v_participant_id;
  end if;
  if to_regclass('public.participant_goals') is not null then
   delete from public.participant_goals where participant_id=v_participant_id;
  end if;
  if to_regclass('public.funding_plans') is not null then
   delete from public.funding_plans where participant_id=v_participant_id;
  end if;
  if to_regclass('public.incidents') is not null then
   delete from public.incidents where participant_id=v_participant_id;
  end if;
  if to_regclass('public.complaints') is not null then
   delete from public.complaints where participant_id=v_participant_id;
  end if;
  delete from public.invoices where participant_id=v_participant_id;
  delete from public.medications where participant_id=v_participant_id;
  delete from public.participants where id=v_participant_id;
 end if;

 -- Handles the case where the fake medication exists but Mary Jane was already removed.
 if v_sifrol_id is not null then
  delete from public.mar_entries where medication_id=v_sifrol_id;
  if to_regclass('public.medication_incidents') is not null then
   delete from public.medication_incidents where medication_id=v_sifrol_id;
  end if;
  if to_regclass('public.controlled_drug_register') is not null then
   delete from public.controlled_drug_register where medication_id=v_sifrol_id;
  end if;
  delete from public.medications where id=v_sifrol_id;
 end if;

 if exists(select 1 from public.participants where lower(btrim(full_name))='mary jane') then
  raise exception 'Mary Jane remains after cleanup; transaction rolled back';
 end if;
 if exists(select 1 from public.medications where lower(btrim(medication_name))='sifrol') then
  raise exception 'Sifrol remains after cleanup; transaction rolled back';
 end if;

 insert into public.audit_events(
  organisation_id,actor_id,table_name,record_id,action,after_data
 )
 select coalesce(v_participant_org,organisation_id),auth.uid(),'preproduction_test_data',
  coalesce(v_participant_id::text,v_sifrol_id::text),'DELETE',
  jsonb_build_object(
   'event','known_test_data_removed',
   'participant','Mary Jane',
   'medication','Sifrol',
   'participant_found',v_participant_count,
   'medication_found',v_sifrol_count,
   'completed_at',now()
  )
 from public.profiles
 where active=true and role='supervisor'
 order by created_at
 limit 1;
end;
$remove_known_test_data$;

commit;

-- A successful run returns a single PASS row.
select
 case
  when exists(select 1 from public.participants where lower(btrim(full_name))='mary jane') then 'FAIL'
  when exists(select 1 from public.medications where lower(btrim(medication_name))='sifrol') then 'FAIL'
  when to_regclass('public.sil_records') is null then 'FAIL'
  when to_regprocedure('public.clock_in_timesheet(uuid,text,text)') is null then 'FAIL'
  when to_regprocedure('public.clock_out_timesheet(integer,text)') is null then 'FAIL'
  else 'PASS'
 end as florence_final_readiness_migration,
 (select count(*) from public.sil_records) as existing_sil_records,
 (select count(*) from public.timesheets where clock_out is null and status='Open') as currently_open_timesheets;
