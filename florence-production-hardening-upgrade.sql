-- Florence production hardening (reviewed release)
-- Additive and non-destructive. Run after:
--   1. supabase-schema.sql
--   2. florence-audit-readiness-upgrade.sql
--   3. florence-operational-controls-upgrade.sql
-- Do not run the destructive base schema again against a live Florence database.

begin;

-- Fail early with a clear message rather than applying only half of the hardening.
do $requirements$
begin
 if to_regclass('public.audit_events') is null
    or to_regprocedure('public.audit_row_change()') is null
    or to_regclass('public.incidents') is null
    or to_regclass('public.controlled_drug_register') is null then
  raise exception 'Run florence-audit-readiness-upgrade.sql before production hardening';
 end if;
 if to_regclass('public.conflict_declarations') is null
    or to_regclass('public.meeting_minutes') is null
    or to_regclass('public.delegations') is null then
  raise exception 'Run florence-operational-controls-upgrade.sql before production hardening';
 end if;
end;
$requirements$;

-- A reusable server-side MFA gate for privileged RPCs.
create or replace function public.require_verified_mfa()
returns void
language plpgsql
stable
set search_path=public,pg_temp
as $$
begin
 if auth.uid() is null then
  raise exception 'Authenticated Florence session required';
 end if;
 if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
  raise exception 'Multi-factor authentication is required';
 end if;
end;
$$;
revoke all on function public.require_verified_mfa() from public;
grant execute on function public.require_verified_mfa() to authenticated;

-- =========================================================
-- PARTICIPANT ACCESS ASSIGNMENTS
-- =========================================================

create table if not exists public.participant_access_assignments (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id) on delete cascade,
 staff_id uuid not null references public.profiles(id) on delete cascade,
 starts_at timestamptz not null default now(),
 ends_at timestamptz,
 active boolean not null default true,
 reason text,
 granted_by uuid not null references public.profiles(id) on delete restrict,
 revoked_by uuid references public.profiles(id) on delete restrict,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint participant_access_valid_window check(ends_at is null or ends_at > starts_at)
);

create unique index if not exists participant_access_active_unique
 on public.participant_access_assignments(participant_id,staff_id)
 where active and revoked_at is null;
create index if not exists participant_access_staff_idx
 on public.participant_access_assignments(staff_id,participant_id);
create index if not exists participant_access_org_idx
 on public.participant_access_assignments(organisation_id,active);

create or replace function public.validate_participant_access_assignment()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_participant_org uuid;
 v_staff_org uuid;
 v_staff_role public.app_role;
 v_staff_active boolean;
 v_grantor_org uuid;
 v_grantor_role public.app_role;
 v_grantor_active boolean;
 v_revoker_org uuid;
 v_revoker_role public.app_role;
begin
 select organisation_id into v_participant_org
 from public.participants where id=new.participant_id;
 if v_participant_org is null or v_participant_org<>new.organisation_id then
  raise exception 'Participant does not belong to this organisation';
 end if;

 select organisation_id,role,active into v_staff_org,v_staff_role,v_staff_active
 from public.profiles where id=new.staff_id;
 if v_staff_org is null or v_staff_org<>new.organisation_id or v_staff_role<>'staff' or not v_staff_active then
  raise exception 'Participant access can only be assigned to an active support worker in this organisation';
 end if;

 select organisation_id,role,active into v_grantor_org,v_grantor_role,v_grantor_active
 from public.profiles where id=new.granted_by;
 if v_grantor_org is null or v_grantor_org<>new.organisation_id or v_grantor_role<>'supervisor' or not v_grantor_active then
  raise exception 'Participant access must be granted by an active supervisor in this organisation';
 end if;

 if new.active then
  if new.revoked_by is not null or new.revoked_at is not null then
   raise exception 'An active assignment cannot contain revocation details';
  end if;
 else
  if new.revoked_by is null or new.revoked_at is null then
   raise exception 'A revoked assignment requires the supervisor and revocation time';
  end if;
  select organisation_id,role into v_revoker_org,v_revoker_role
  from public.profiles where id=new.revoked_by and active=true;
  if v_revoker_org is null or v_revoker_org<>new.organisation_id or v_revoker_role<>'supervisor' then
   raise exception 'Participant access must be revoked by an active supervisor in this organisation';
  end if;
 end if;

 if new.ends_at is not null and new.ends_at<=new.starts_at then
  raise exception 'Participant access end time must be after its start time';
 end if;
 new.updated_at=now();
 return new;
end;
$$;

alter table public.participant_access_assignments enable row level security;
drop trigger if exists participant_access_validate on public.participant_access_assignments;
create trigger participant_access_validate
before insert or update on public.participant_access_assignments
for each row execute function public.validate_participant_access_assignment();

-- No hard delete policy is provided: revocation retains the access history.
drop policy if exists participant_access_supervisor_all on public.participant_access_assignments;
drop policy if exists participant_access_supervisor_select on public.participant_access_assignments;
drop policy if exists participant_access_supervisor_insert on public.participant_access_assignments;
drop policy if exists participant_access_supervisor_update on public.participant_access_assignments;
drop policy if exists participant_access_own_select on public.participant_access_assignments;
create policy participant_access_supervisor_select on public.participant_access_assignments
 for select using(public.is_supervisor() and organisation_id=public.current_org_id());
create policy participant_access_own_select on public.participant_access_assignments
 for select using(staff_id=auth.uid() and organisation_id=public.current_org_id());
create policy participant_access_supervisor_insert on public.participant_access_assignments
 for insert with check(
  public.is_supervisor() and organisation_id=public.current_org_id() and granted_by=auth.uid()
 );
create policy participant_access_supervisor_update on public.participant_access_assignments
 for update using(public.is_supervisor() and organisation_id=public.current_org_id())
 with check(public.is_supervisor() and organisation_id=public.current_org_id());

revoke all on public.participant_access_assignments from anon,authenticated;
grant select,insert,update on public.participant_access_assignments to authenticated;

create or replace function public.can_access_participant(p_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
 select exists(
  select 1
  from public.profiles me
  join public.participants participant
    on participant.id=p_participant_id
   and participant.organisation_id=me.organisation_id
  where me.id=auth.uid()
    and me.active
    and coalesce(auth.jwt()->>'aal','aal1')='aal2'
    and (
     me.role='supervisor'
     or (me.role in('client','family') and me.participant_id=p_participant_id)
     or (me.role='staff' and (
      exists(
       select 1 from public.participant_access_assignments assignment
       where assignment.organisation_id=me.organisation_id
         and assignment.participant_id=p_participant_id
         and assignment.staff_id=me.id
         and assignment.active
         and assignment.revoked_at is null
         and assignment.starts_at<=now()
         and (assignment.ends_at is null or assignment.ends_at>now())
      )
      or exists(
       select 1 from public.shifts shift_record
       where shift_record.organisation_id=me.organisation_id
         and shift_record.participant_id=p_participant_id
         and shift_record.assigned_staff_id=me.id
         and shift_record.status in('Published','Completed')
         and shift_record.response<>'Declined'
         and now() between shift_record.starts_at-interval '12 hours'
                       and shift_record.ends_at+interval '12 hours'
      )
     ))
    )
 );
$$;
revoke all on function public.can_access_participant(uuid) from public;
grant execute on function public.can_access_participant(uuid) to authenticated;

-- =========================================================
-- ASSIGNMENT-SCOPED CARE DATA
-- =========================================================

drop policy if exists participants_select on public.participants;
create policy participants_select on public.participants for select
 using(organisation_id=public.current_org_id() and public.can_access_participant(id));

drop policy if exists medications_select on public.medications;
create policy medications_select on public.medications for select
 using(organisation_id=public.current_org_id() and public.can_access_participant(participant_id));

drop policy if exists mar_select on public.mar_entries;
create policy mar_select on public.mar_entries for select
 using(organisation_id=public.current_org_id() and public.can_access_participant(participant_id));
-- MAR inserts must go through record_medication_administration so the PIN, MFA,
-- access boundary and medication status are verified on the server.
drop policy if exists mar_staff_insert on public.mar_entries;

drop policy if exists notes_select on public.progress_notes;
create policy notes_select on public.progress_notes for select
 using(organisation_id=public.current_org_id() and public.can_access_participant(participant_id));
-- Progress notes are immutable from the browser once signed. Corrections must be
-- made as an auditable follow-up note rather than overwriting the signed record.
drop policy if exists notes_staff_insert on public.progress_notes;
drop policy if exists notes_staff_update_own on public.progress_notes;

drop policy if exists timeline_select on public.client_timeline;
create policy timeline_select on public.client_timeline for select
 using(organisation_id=public.current_org_id() and public.can_access_participant(participant_id));
drop policy if exists timeline_staff_insert on public.client_timeline;
create policy timeline_staff_insert on public.client_timeline for insert with check(
 organisation_id=public.current_org_id() and created_by=auth.uid()
 and public.current_role() in('supervisor','staff')
 and public.can_access_participant(participant_id)
);
drop policy if exists timeline_staff_update on public.client_timeline;
create policy timeline_staff_update on public.client_timeline for update
 using(
  organisation_id=public.current_org_id()
  and public.can_access_participant(participant_id)
  and (public.is_supervisor() or created_by=auth.uid())
 )
 with check(
  organisation_id=public.current_org_id()
  and public.can_access_participant(participant_id)
  and (public.is_supervisor() or created_by=auth.uid())
 );

drop policy if exists portal_threads_select on public.portal_threads;
create policy portal_threads_select on public.portal_threads for select
 using(organisation_id=public.current_org_id() and public.can_access_participant(participant_id));
drop policy if exists portal_threads_insert on public.portal_threads;
create policy portal_threads_insert on public.portal_threads for insert with check(
 organisation_id=public.current_org_id() and created_by=auth.uid()
 and public.can_access_participant(participant_id)
);
drop policy if exists portal_threads_update on public.portal_threads;
create policy portal_threads_update on public.portal_threads for update
 using(organisation_id=public.current_org_id() and public.can_access_participant(participant_id))
 with check(organisation_id=public.current_org_id() and public.can_access_participant(participant_id));

drop policy if exists portal_messages_select on public.portal_messages;
create policy portal_messages_select on public.portal_messages for select using(
 organisation_id=public.current_org_id() and exists(
  select 1 from public.portal_threads thread_record
  where thread_record.id=thread_id
    and thread_record.organisation_id=public.current_org_id()
    and public.can_access_participant(thread_record.participant_id)
 )
);
drop policy if exists portal_messages_insert on public.portal_messages;
create policy portal_messages_insert on public.portal_messages for insert with check(
 organisation_id=public.current_org_id() and sender_id=auth.uid() and exists(
  select 1 from public.portal_threads thread_record
  where thread_record.id=thread_id
    and thread_record.organisation_id=public.current_org_id()
    and public.can_access_participant(thread_record.participant_id)
 )
);

-- =========================================================
-- CONTROLLED SHIFT ACTIONS
-- =========================================================

-- Direct worker updates were too broad: RLS could not prevent a worker from changing
-- the participant, times or instructions while accepting a shift.
drop policy if exists shifts_staff_update on public.shifts;
drop policy if exists shifts_staff_claim on public.shifts;

create or replace function public.claim_open_shift(p_shift_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_shift_id uuid;
begin
 perform public.require_verified_mfa();
 select * into v_profile from public.profiles where id=auth.uid() and active=true;
 if v_profile.id is null or v_profile.role not in('staff','supervisor') then
  raise exception 'Only active support workers can claim an open shift';
 end if;

 update public.shifts
 set assigned_staff_id=v_profile.id,
     response='Accepted',
     responded_at=now(),
     updated_at=now()
 where id=p_shift_id
   and organisation_id=v_profile.organisation_id
   and assigned_staff_id is null
   and status='Published'
 returning id into v_shift_id;

 if v_shift_id is null then
  raise exception 'This shift is no longer available';
 end if;
 return v_shift_id;
end;
$$;
revoke all on function public.claim_open_shift(uuid) from public;
grant execute on function public.claim_open_shift(uuid) to authenticated;

create or replace function public.respond_to_shift(
 p_shift_id uuid,
 p_response public.shift_response
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_shift_id uuid;
begin
 perform public.require_verified_mfa();
 if p_response not in('Accepted'::public.shift_response,'Declined'::public.shift_response) then
  raise exception 'Shift response must be Accepted or Declined';
 end if;
 select * into v_profile from public.profiles where id=auth.uid() and active=true;
 if v_profile.id is null or v_profile.role not in('staff','supervisor') then
  raise exception 'Only active support workers can respond to a shift';
 end if;

 update public.shifts
 set response=p_response,
     responded_at=now(),
     updated_at=now()
 where id=p_shift_id
   and organisation_id=v_profile.organisation_id
   and assigned_staff_id=v_profile.id
   and status='Published'
 returning id into v_shift_id;

 if v_shift_id is null then
  raise exception 'This shift is not available for your response';
 end if;
 return v_shift_id;
end;
$$;
revoke all on function public.respond_to_shift(uuid,public.shift_response) from public;
grant execute on function public.respond_to_shift(uuid,public.shift_response) to authenticated;

-- Open shifts notify workers without attempting to insert a notification with a null recipient.
create or replace function public.notify_shift_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
 if new.status='Published'
    and new.response in('Not sent','Pending')
    and (
     tg_op='INSERT'
     or old.status is distinct from new.status
     or old.assigned_staff_id is distinct from new.assigned_staff_id
    ) then
  if new.assigned_staff_id is not null then
   insert into public.notifications(organisation_id,recipient_id,title,body,category,related_record_id)
   values(new.organisation_id,new.assigned_staff_id,'Shift awaiting response',
    'A published shift is ready to accept or decline.','Roster',new.id);
  else
   insert into public.notifications(organisation_id,recipient_id,title,body,category,related_record_id)
   select new.organisation_id,worker.id,'Open shift available',
    'A published open shift is available to claim.','Roster',new.id
   from public.profiles worker
   where worker.organisation_id=new.organisation_id
     and worker.role='staff'
     and worker.active=true;
  end if;
 end if;

 if tg_op='UPDATE'
    and old.response is distinct from new.response
    and new.response in('Accepted','Declined') then
  insert into public.notifications(organisation_id,recipient_id,title,body,category,related_record_id)
  select new.organisation_id,supervisor.id,'Shift '||lower(new.response::text),
   'A worker has '||lower(new.response::text)||' an assigned shift.','Roster',new.id
  from public.profiles supervisor
  where supervisor.organisation_id=new.organisation_id
    and supervisor.role='supervisor'
    and supervisor.active=true
    and (auth.uid() is null or supervisor.id<>auth.uid());
 end if;
 return new;
end;
$$;
drop trigger if exists shifts_notify on public.shifts;
create trigger shifts_notify
after insert or update on public.shifts
for each row execute function public.notify_shift_change();

-- =========================================================
-- HARDENED SIGNING FUNCTIONS
-- =========================================================

alter table public.progress_notes add column if not exists declaration_confirmed boolean not null default false;
alter table public.progress_notes add column if not exists pin_verified boolean not null default false;
alter table public.progress_notes add column if not exists signed_at timestamptz;

create or replace function public.set_my_signing_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_org uuid;
begin
 perform public.require_verified_mfa();
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  raise exception 'PIN must contain exactly six numbers';
 end if;

 update public.profiles
 set medication_pin_hash=crypt(p_pin,gen_salt('bf')),
     updated_at=now()
 where id=auth.uid()
   and active=true
   and role in('staff','supervisor')
 returning organisation_id into v_org;

 if v_org is null then
  raise exception 'Active staff profile not found';
 end if;

 insert into public.audit_events(organisation_id,actor_id,table_name,record_id,action,after_data)
 values(v_org,auth.uid(),'profiles',auth.uid()::text,'UPDATE',jsonb_build_object('field','signing_pin','result','changed'));
end;
$$;
revoke all on function public.set_my_signing_pin(text) from public;
grant execute on function public.set_my_signing_pin(text) to authenticated;

create or replace function public.record_medication_administration(
 p_medication_id uuid,
 p_pin text,
 p_status public.mar_status default 'Administered',
 p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_medication public.medications%rowtype;
 v_entry_id uuid;
begin
 perform public.require_verified_mfa();
 select * into v_profile from public.profiles where id=auth.uid() and active=true;
 if v_profile.id is null or v_profile.role not in('supervisor','staff') then
  raise exception 'Only active staff can record medication administration';
 end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  raise exception 'Enter your six-digit signing PIN';
 end if;
 if v_profile.medication_pin_hash is null
    or crypt(p_pin,v_profile.medication_pin_hash)<>v_profile.medication_pin_hash then
  raise exception 'Incorrect medication PIN';
 end if;

 select * into v_medication
 from public.medications
 where id=p_medication_id
   and organisation_id=v_profile.organisation_id
   and active=true;
 if v_medication.id is null then
  raise exception 'Medication is not available';
 end if;
 if not public.can_access_participant(v_medication.participant_id) then
  raise exception 'You are not authorised for this participant';
 end if;
 if v_medication.ceased_at is not null and v_medication.ceased_at<=current_date then
  raise exception 'This medication has been ceased';
 end if;
 if v_medication.hold_from is not null
    and v_medication.hold_from<=current_date
    and (v_medication.hold_until is null or v_medication.hold_until>=current_date) then
  raise exception 'This medication is currently on hold';
 end if;
 if p_status<>'Administered'::public.mar_status and nullif(btrim(coalesce(p_notes,'')),'') is null then
  raise exception 'A reason is required when medication is not administered';
 end if;

 insert into public.mar_entries(
  organisation_id,medication_id,participant_id,staff_id,status,pin_verified,notes
 ) values(
  v_profile.organisation_id,v_medication.id,v_medication.participant_id,
  v_profile.id,p_status,true,nullif(btrim(coalesce(p_notes,'')),'')
 ) returning id into v_entry_id;
 return v_entry_id;
end;
$$;
revoke all on function public.record_medication_administration(uuid,text,public.mar_status,text) from public;
grant execute on function public.record_medication_administration(uuid,text,public.mar_status,text) to authenticated;

create or replace function public.record_progress_note(
 p_participant_id uuid,
 p_category text,
 p_content text,
 p_status text,
 p_pin text,
 p_declaration_confirmed boolean
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
 v_note_id uuid;
 v_status text;
begin
 perform public.require_verified_mfa();
 select * into v_profile from public.profiles where id=auth.uid() and active=true;
 if v_profile.id is null or v_profile.role not in('supervisor','staff') then
  raise exception 'Only active staff can sign progress notes';
 end if;
 if p_declaration_confirmed is not true then
  raise exception 'Confirm that the progress note is true and correct';
 end if;
 if nullif(btrim(coalesce(p_category,'')),'') is null then
  raise exception 'Progress note category is required';
 end if;
 if nullif(btrim(coalesce(p_content,'')),'') is null then
  raise exception 'Progress note content is required';
 end if;
 v_status:=coalesce(nullif(btrim(p_status),''),'Final');
 if v_status not in('Final','Draft') then
  raise exception 'Progress note status is not valid';
 end if;
 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  raise exception 'Enter your six-digit signing PIN';
 end if;
 if v_profile.medication_pin_hash is null
    or crypt(p_pin,v_profile.medication_pin_hash)<>v_profile.medication_pin_hash then
  raise exception 'Incorrect PIN';
 end if;
 if not public.can_access_participant(p_participant_id) then
  raise exception 'You are not authorised for this participant';
 end if;

 insert into public.progress_notes(
  organisation_id,participant_id,staff_id,category,content,status,
  declaration_confirmed,pin_verified,signed_at
 ) values(
  v_profile.organisation_id,p_participant_id,v_profile.id,btrim(p_category),
  btrim(p_content),v_status,true,true,now()
 ) returning id into v_note_id;
 return v_note_id;
end;
$$;
revoke all on function public.record_progress_note(uuid,text,text,text,text,boolean) from public;
grant execute on function public.record_progress_note(uuid,text,text,text,text,boolean) to authenticated;

-- =========================================================
-- PRIVATE DOCUMENT BOUNDARY
-- =========================================================

drop policy if exists compliance_select on public.compliance_documents;
create policy compliance_select on public.compliance_documents for select using(
 organisation_id=public.current_org_id() and (
  public.is_supervisor()
  or (scope='Organisation' and public.current_role()='staff')
  or (scope='Staff' and subject_id=auth.uid())
  or (scope='Participant' and public.can_access_participant(subject_id))
 )
);

drop policy if exists florence_storage_read on storage.objects;
drop policy if exists florence_storage_insert on storage.objects;
drop policy if exists florence_storage_update on storage.objects;
drop policy if exists florence_storage_delete on storage.objects;

create policy florence_storage_read
on storage.objects for select to authenticated using(
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and exists(
  select 1 from public.compliance_documents document_record
  where document_record.storage_path=name
    and document_record.organisation_id=public.current_org_id()
    and (
     public.is_supervisor()
     or (document_record.scope='Organisation' and public.current_role()='staff')
     or (document_record.scope='Staff' and document_record.subject_id=auth.uid())
     or (document_record.scope='Participant' and public.can_access_participant(document_record.subject_id))
    )
 )
);
create policy florence_storage_insert
on storage.objects for insert to authenticated with check(
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and (storage.foldername(name))[1]=public.current_org_id()::text
);
create policy florence_storage_update
on storage.objects for update to authenticated
using(
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and (storage.foldername(name))[1]=public.current_org_id()::text
)
with check(
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and (storage.foldername(name))[1]=public.current_org_id()::text
);
create policy florence_storage_delete
on storage.objects for delete to authenticated using(
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and (storage.foldername(name))[1]=public.current_org_id()::text
);

-- =========================================================
-- OTHER OPERATIONAL RECORDS
-- =========================================================

-- Incidents can be organisation-level (participant_id null), otherwise assignment-scoped.
drop policy if exists incidents_org_select on public.incidents;
create policy incidents_org_select on public.incidents for select using(
 organisation_id=public.current_org_id()
 and (public.is_supervisor() or (participant_id is not null and public.can_access_participant(participant_id)))
);

do $$
declare table_name text;
begin
 foreach table_name in array array[
  'medication_incidents','emergency_plans','participant_goals','funding_plans','controlled_drug_register'
 ] loop
  execute format('drop policy if exists %I_org_select on public.%I',table_name,table_name);
  execute format(
   'create policy %I_org_select on public.%I for select using (organisation_id=public.current_org_id() and public.can_access_participant(participant_id))',
   table_name,table_name
  );
 end loop;
end $$;

drop policy if exists incidents_staff_insert on public.incidents;
create policy incidents_staff_insert on public.incidents for insert with check(
 organisation_id=public.current_org_id() and reported_by=auth.uid()
 and public.current_role() in('staff','supervisor')
 and (participant_id is null or public.can_access_participant(participant_id))
);
drop policy if exists medication_incidents_staff_insert on public.medication_incidents;
create policy medication_incidents_staff_insert on public.medication_incidents for insert with check(
 organisation_id=public.current_org_id() and reported_by=auth.uid()
 and public.current_role() in('staff','supervisor')
 and public.can_access_participant(participant_id)
);
drop policy if exists participant_goals_staff_insert on public.participant_goals;
create policy participant_goals_staff_insert on public.participant_goals for insert with check(
 organisation_id=public.current_org_id() and created_by=auth.uid()
 and public.current_role() in('staff','supervisor')
 and public.can_access_participant(participant_id)
);
drop policy if exists controlled_drug_register_org_select on public.controlled_drug_register;
create policy controlled_drug_register_org_select on public.controlled_drug_register for select using(
 organisation_id=public.current_org_id()
 and public.current_role() in('staff','supervisor')
 and public.can_access_participant(participant_id)
);
drop policy if exists controlled_drug_register_staff_insert on public.controlled_drug_register;
create policy controlled_drug_register_staff_insert on public.controlled_drug_register for insert with check(
 organisation_id=public.current_org_id() and recorded_by=auth.uid()
 and public.current_role() in('staff','supervisor')
 and public.can_access_participant(participant_id)
 and witnessed_by is not null and witnessed_by<>auth.uid()
);
drop policy if exists staff_credentials_org_select on public.staff_credentials;
create policy staff_credentials_org_select on public.staff_credentials for select using(
 organisation_id=public.current_org_id() and (public.is_supervisor() or staff_id=auth.uid())
);

-- =========================================================
-- ACCESS AUDIT EVENTS
-- =========================================================

alter table public.audit_events drop constraint if exists audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check
 check(action in('INSERT','UPDATE','DELETE','VIEW','DOWNLOAD','EXPORT','LOGIN','MFA_ENROLLED'));

create or replace function public.record_access_event(
 p_action text,
 p_table_name text,
 p_record_id text default null,
 p_metadata jsonb default '{}'::jsonb
) returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_id bigint;
 v_profile public.profiles%rowtype;
begin
 perform public.require_verified_mfa();
 if p_action not in('VIEW','DOWNLOAD','EXPORT','LOGIN','MFA_ENROLLED') then
  raise exception 'Unsupported audit action';
 end if;
 if nullif(btrim(coalesce(p_table_name,'')),'') is null then
  raise exception 'Audit table name is required';
 end if;
 if octet_length(coalesce(p_metadata,'{}'::jsonb)::text)>16384 then
  raise exception 'Audit metadata is too large';
 end if;
 select * into v_profile from public.profiles where id=auth.uid() and active=true;
 if v_profile.id is null then
  raise exception 'Active Florence profile required';
 end if;

 insert into public.audit_events(organisation_id,actor_id,table_name,record_id,action,after_data)
 values(
  v_profile.organisation_id,v_profile.id,left(btrim(p_table_name),80),p_record_id,p_action,
  coalesce(p_metadata,'{}'::jsonb)
 ) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.record_access_event(text,text,text,jsonb) from public;
grant execute on function public.record_access_event(text,text,text,jsonb) to authenticated;

-- =========================================================
-- RECORD RETENTION REGISTER
-- =========================================================

create table if not exists public.retention_rules (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 record_category text not null,
 table_name text not null,
 minimum_months integer,
 authority text not null,
 review_frequency_months integer not null default 12,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(organisation_id,table_name),
 constraint retention_minimum_nonnegative check(minimum_months is null or minimum_months>=0),
 constraint retention_review_positive check(review_frequency_months>0)
);
alter table public.retention_rules add column if not exists updated_at timestamptz not null default now();

create table if not exists public.retention_register (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 table_name text not null,
 record_id uuid not null,
 record_category text not null,
 retain_until date,
 next_review_date date not null,
 legal_hold boolean not null default false,
 status text not null default 'Retain' check(status in('Retain','Review due','Approved for disposal','Disposed')),
 decision_notes text,
 decided_by uuid references public.profiles(id),
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.retention_register drop constraint if exists retention_register_table_name_record_id_key;
create unique index if not exists retention_register_org_record_unique
 on public.retention_register(organisation_id,table_name,record_id);
create index if not exists retention_register_review_idx
 on public.retention_register(organisation_id,next_review_date,status);

create or replace function public.validate_retention_register()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
 if new.status in('Approved for disposal','Disposed') then
  if new.legal_hold then
   raise exception 'A record under legal hold cannot be approved for disposal';
  end if;
  if new.retain_until is null or new.retain_until>current_date then
   raise exception 'The minimum retention period has not ended';
  end if;
  if nullif(btrim(coalesce(new.decision_notes,'')),'') is null
     or new.decided_by is null or new.decided_at is null then
   raise exception 'A documented supervisor decision is required before disposal';
  end if;
  if auth.uid() is not null and new.decided_by<>auth.uid() then
   raise exception 'The signed-in supervisor must record the disposal decision';
  end if;
 end if;
 new.updated_at=now();
 return new;
end;
$$;

drop trigger if exists retention_rules_touch_updated_at on public.retention_rules;
create trigger retention_rules_touch_updated_at
before update on public.retention_rules
for each row execute function public.touch_updated_at();
drop trigger if exists retention_register_validate on public.retention_register;
create trigger retention_register_validate
before insert or update on public.retention_register
for each row execute function public.validate_retention_register();

alter table public.retention_rules enable row level security;
alter table public.retention_register enable row level security;
drop policy if exists retention_rules_org_select on public.retention_rules;
drop policy if exists retention_rules_supervisor_all on public.retention_rules;
drop policy if exists retention_rules_supervisor_insert on public.retention_rules;
drop policy if exists retention_rules_supervisor_update on public.retention_rules;
drop policy if exists retention_register_supervisor_all on public.retention_register;
drop policy if exists retention_register_supervisor_select on public.retention_register;
drop policy if exists retention_register_supervisor_insert on public.retention_register;
drop policy if exists retention_register_supervisor_update on public.retention_register;

create policy retention_rules_org_select on public.retention_rules for select
 using(organisation_id=public.current_org_id());
create policy retention_rules_supervisor_insert on public.retention_rules for insert
 with check(public.is_supervisor() and organisation_id=public.current_org_id());
create policy retention_rules_supervisor_update on public.retention_rules for update
 using(public.is_supervisor() and organisation_id=public.current_org_id())
 with check(public.is_supervisor() and organisation_id=public.current_org_id());
create policy retention_register_supervisor_select on public.retention_register for select
 using(public.is_supervisor() and organisation_id=public.current_org_id());
create policy retention_register_supervisor_insert on public.retention_register for insert
 with check(public.is_supervisor() and organisation_id=public.current_org_id());
create policy retention_register_supervisor_update on public.retention_register for update
 using(public.is_supervisor() and organisation_id=public.current_org_id())
 with check(public.is_supervisor() and organisation_id=public.current_org_id());

revoke all on public.retention_rules from anon,authenticated;
revoke all on public.retention_register from anon,authenticated;
grant select,insert,update on public.retention_rules to authenticated;
grant select,insert,update on public.retention_register to authenticated;

insert into public.retention_rules(
 organisation_id,record_category,table_name,minimum_months,authority
)
select id,'Incident record','incidents',84,
 'NDIS (Incident Management and Reportable Incidents) Rules 2018'
from public.organisations
on conflict(organisation_id,table_name) do update set
 minimum_months=excluded.minimum_months,
 authority=excluded.authority,
 updated_at=now();

insert into public.retention_rules(
 organisation_id,record_category,table_name,minimum_months,authority
)
select id,'Complaint record','complaints',84,
 'NDIS (Complaints Management and Resolution) Rules 2018'
from public.organisations
on conflict(organisation_id,table_name) do update set
 minimum_months=excluded.minimum_months,
 authority=excluded.authority,
 updated_at=now();

create or replace function public.register_retention_record()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 retention_rule public.retention_rules%rowtype;
 base_date date;
begin
 select * into retention_rule
 from public.retention_rules
 where organisation_id=new.organisation_id
   and table_name=tg_table_name
   and active=true;
 if not found then return new; end if;

 base_date:=coalesce(
  (to_jsonb(new)->>'occurred_at')::timestamptz::date,
  (to_jsonb(new)->>'received_at')::timestamptz::date,
  current_date
 );
 insert into public.retention_register(
  organisation_id,table_name,record_id,record_category,retain_until,next_review_date
 ) values(
  new.organisation_id,tg_table_name,new.id,retention_rule.record_category,
  case when retention_rule.minimum_months is null then null
       else (base_date+(retention_rule.minimum_months||' months')::interval)::date end,
  (current_date+(retention_rule.review_frequency_months||' months')::interval)::date
 )
 on conflict(organisation_id,table_name,record_id) do nothing;
 return new;
end;
$$;
revoke all on function public.register_retention_record() from public;

drop trigger if exists incidents_retention_register on public.incidents;
create trigger incidents_retention_register
after insert on public.incidents
for each row execute function public.register_retention_record();
drop trigger if exists complaints_retention_register on public.complaints;
create trigger complaints_retention_register
after insert on public.complaints
for each row execute function public.register_retention_record();

insert into public.retention_register(
 organisation_id,table_name,record_id,record_category,retain_until,next_review_date
)
select incident.organisation_id,'incidents',incident.id,'Incident record',
 (incident.occurred_at::date+interval '84 months')::date,
 (current_date+interval '12 months')::date
from public.incidents incident
on conflict(organisation_id,table_name,record_id) do nothing;

insert into public.retention_register(
 organisation_id,table_name,record_id,record_category,retain_until,next_review_date
)
select complaint.organisation_id,'complaints',complaint.id,'Complaint record',
 (complaint.received_at::date+interval '84 months')::date,
 (current_date+interval '12 months')::date
from public.complaints complaint
on conflict(organisation_id,table_name,record_id) do nothing;

-- =========================================================
-- MANDATORY MFA FOR SENSITIVE TABLES
-- =========================================================

-- Restrictive policies must pass in addition to the table's role/participant policy.
do $$
declare table_name text;
begin
 foreach table_name in array array[
  'participants','shifts','medications','mar_entries','progress_notes','client_timeline',
  'portal_threads','portal_messages','compliance_documents','incidents','complaints',
  'medication_incidents','emergency_plans','staff_credentials','timesheets',
  'participant_goals','funding_plans','controlled_drug_register','audit_events',
  'participant_access_assignments','retention_rules','retention_register',
  'organisations','profiles','invoices','notifications','worker_availability',
  'leave_requests','travel_expenses','ndis_support_items','conflict_declarations',
  'meeting_minutes','delegations','xero_connections','xero_oauth_states'
 ] loop
  if to_regclass(format('public.%I',table_name)) is not null then
   execute format('alter table public.%I enable row level security',table_name);
   execute format('drop policy if exists %I_mfa_required on public.%I',table_name,table_name);
   execute format(
    'create policy %I_mfa_required on public.%I as restrictive for all to authenticated using (coalesce(auth.jwt()->>''aal'',''aal1'')=''aal2'') with check (coalesce(auth.jwt()->>''aal'',''aal1'')=''aal2'')',
    table_name,table_name
   );
  end if;
 end loop;
end $$;

-- Audit the new control tables. Existing care tables are already audited by the audit-readiness upgrade.
drop trigger if exists participant_access_audit on public.participant_access_assignments;
create trigger participant_access_audit
after insert or update or delete on public.participant_access_assignments
for each row execute function public.audit_row_change();
drop trigger if exists retention_rules_audit on public.retention_rules;
create trigger retention_rules_audit
after insert or update or delete on public.retention_rules
for each row execute function public.audit_row_change();
drop trigger if exists retention_register_audit on public.retention_register;
create trigger retention_register_audit
after insert or update or delete on public.retention_register
for each row execute function public.audit_row_change();

commit;
