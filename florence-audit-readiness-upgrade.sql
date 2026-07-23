-- Florence audit-readiness expansion
-- Non-destructive: run once in Supabase SQL Editor after supabase-schema.sql.

create table if not exists public.incidents (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid references public.participants(id) on delete set null, reported_by uuid not null references public.profiles(id) on delete restrict,
 occurred_at timestamptz not null, location text, category text not null, severity text not null check(severity in ('Low','Moderate','High','Critical')),
 description text not null, immediate_actions text not null, injury_or_harm text, witnesses text, emergency_services boolean not null default false,
 reportable_status text not null default 'Assessment required', commission_reference text, supervisor_review text,
 corrective_actions text, status text not null default 'Open', closed_at timestamptz, reviewed_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.complaints (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid references public.participants(id) on delete set null, submitted_by uuid references public.profiles(id) on delete set null,
 complainant_name text not null, complainant_contact text, received_at timestamptz not null default now(), channel text not null,
 subject text not null, details text not null, desired_outcome text, advocate_details text, acknowledged_at timestamptz,
 assigned_to uuid references public.profiles(id), investigation text, actions_taken text, outcome text, appeal_information text,
 status text not null default 'Received', resolved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.medication_incidents (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id) on delete cascade, medication_id uuid references public.medications(id) on delete set null,
 reported_by uuid not null references public.profiles(id) on delete restrict, occurred_at timestamptz not null, incident_type text not null,
 description text not null, immediate_actions text not null, clinical_advice text, notified_people text, participant_outcome text,
 follow_up text, status text not null default 'Open', reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.emergency_plans (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null unique references public.participants(id) on delete cascade, emergency_contacts text,
 evacuation_plan text, medical_emergency_plan text, communication_support text, continuity_arrangements text,
 essential_equipment text, preferred_hospital text, risks text, last_tested_at date, next_review_date date,
 approved_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.staff_credentials (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 staff_id uuid not null references public.profiles(id) on delete cascade, credential_type text not null, reference_number text,
 issued_date date, expiry_date date, status text not null default 'Current', verified_by uuid references public.profiles(id),
 verified_at timestamptz, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.timesheets (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 staff_id uuid not null references public.profiles(id) on delete restrict, shift_id uuid references public.shifts(id) on delete set null,
 clock_in timestamptz not null, clock_out timestamptz, break_minutes integer not null default 0 check(break_minutes>=0),
 sleepover_hours numeric(6,2) not null default 0, notes text, status text not null default 'Open',
 approved_by uuid references public.profiles(id), approved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.worker_availability (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 staff_id uuid not null references public.profiles(id) on delete cascade, starts_at timestamptz not null, ends_at timestamptz not null,
 availability_type text not null default 'Available', notes text, created_at timestamptz not null default now(),
 constraint availability_valid_range check(ends_at>starts_at)
);
create table if not exists public.leave_requests (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 staff_id uuid not null references public.profiles(id) on delete cascade, starts_on date not null, ends_on date not null,
 leave_type text not null, reason text, status text not null default 'Pending', reviewed_by uuid references public.profiles(id),
 reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint leave_valid_range check(ends_on>=starts_on)
);
create table if not exists public.travel_expenses (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 staff_id uuid not null references public.profiles(id) on delete restrict, participant_id uuid references public.participants(id) on delete set null,
 shift_id uuid references public.shifts(id) on delete set null, expense_date date not null, kilometres numeric(8,2) not null default 0,
 amount numeric(10,2) not null default 0, expense_type text not null, description text, receipt_path text,
 status text not null default 'Pending', approved_by uuid references public.profiles(id), approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.participant_goals (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id) on delete cascade, title text not null, description text,
 target_date date, progress_percent integer not null default 0 check(progress_percent between 0 and 100),
 status text not null default 'Active', outcome_notes text, created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.funding_plans (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id) on delete cascade, plan_number text, starts_on date not null, ends_on date not null,
 management_type text, allocated_amount numeric(12,2) not null default 0, used_amount numeric(12,2) not null default 0,
 notes text, status text not null default 'Active', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.ndis_support_items (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 item_number text not null, item_name text not null, unit text not null default 'Hour', rate numeric(10,2) not null,
 active boolean not null default true, effective_from date, effective_to date, created_at timestamptz not null default now(),
 unique(organisation_id,item_number,effective_from)
);
create table if not exists public.audit_events (
 id bigint generated always as identity primary key, organisation_id uuid not null references public.organisations(id) on delete cascade,
 actor_id uuid references public.profiles(id) on delete set null, table_name text not null, record_id text,
 action text not null check(action in ('INSERT','UPDATE','DELETE')), before_data jsonb, after_data jsonb,
 occurred_at timestamptz not null default now()
);

alter table public.shifts add column if not exists cancellation_reason text;
alter table public.shifts add column if not exists cancelled_at timestamptz;
alter table public.shifts add column if not exists recurrence_group uuid;
alter table public.shifts add column if not exists handover_notes text;
alter table public.medications add column if not exists ceased_at date;
alter table public.medications add column if not exists hold_from date;
alter table public.medications add column if not exists hold_until date;
alter table public.medications add column if not exists prn_indication text;
alter table public.medications add column if not exists max_prn_dose text;
alter table public.mar_entries add column if not exists effectiveness_review text;
alter table public.mar_entries add column if not exists amended_at timestamptz;
alter table public.mar_entries add column if not exists amendment_reason text;

do $$ declare t text; begin
 foreach t in array array['incidents','complaints','medication_incidents','emergency_plans','staff_credentials','timesheets','worker_availability','leave_requests','travel_expenses','participant_goals','funding_plans','ndis_support_items','audit_events']
 loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

create or replace function public.audit_row_change() returns trigger language plpgsql security definer set search_path=public as $$
declare org uuid; rid text;
begin
 org:=coalesce((to_jsonb(new)->>'organisation_id')::uuid,(to_jsonb(old)->>'organisation_id')::uuid);
 rid:=coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id');
 insert into public.audit_events(organisation_id,actor_id,table_name,record_id,action,before_data,after_data)
 values(org,auth.uid(),tg_table_name,rid,tg_op,case when tg_op in('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op in('INSERT','UPDATE') then to_jsonb(new) end);
 return coalesce(new,old);
end $$;

do $$ declare t text; begin
 foreach t in array array['participants','shifts','medications','mar_entries','progress_notes','client_timeline','portal_threads','incidents','complaints','medication_incidents','emergency_plans','staff_credentials','timesheets','leave_requests','travel_expenses','participant_goals','funding_plans','invoices']
 loop
  execute format('drop trigger if exists %I_audit on public.%I',t,t);
  execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()',t,t);
 end loop;
end $$;

create or replace function public.notify_shift_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='Published' and (tg_op='INSERT' or old.status is distinct from new.status or old.assigned_staff_id is distinct from new.assigned_staff_id) then
  insert into public.notifications(organisation_id,recipient_id,title,body,category,related_record_id)
  values(new.organisation_id,new.assigned_staff_id,'Shift awaiting response','A published shift is ready to accept or decline.','Roster',new.id);
 end if;
 if tg_op='UPDATE' and old.response is distinct from new.response and new.response in('Accepted','Declined') then
  insert into public.notifications(organisation_id,recipient_id,title,body,category,related_record_id)
  select new.organisation_id,id,'Shift '||lower(new.response),'A worker has '||lower(new.response)||' an assigned shift.','Roster',new.id
  from public.profiles where organisation_id=new.organisation_id and role='supervisor' and active=true and id<>auth.uid();
 end if;
 return new;
end $$;
drop trigger if exists shifts_notify on public.shifts;
create trigger shifts_notify after insert or update on public.shifts for each row execute function public.notify_shift_change();

-- Policies: organisation members can read care operations; supervisors manage, staff create operational records.
do $$ declare t text; begin
 foreach t in array array['incidents','medication_incidents','emergency_plans','staff_credentials','participant_goals','funding_plans','ndis_support_items']
 loop
  execute format('drop policy if exists %I_org_select on public.%I',t,t);
  execute format('create policy %I_org_select on public.%I for select using (organisation_id=public.current_org_id())',t,t);
  execute format('drop policy if exists %I_supervisor_all on public.%I',t,t);
  execute format('create policy %I_supervisor_all on public.%I for all using (public.is_supervisor() and organisation_id=public.current_org_id()) with check (public.is_supervisor() and organisation_id=public.current_org_id())',t,t);
 end loop;
end $$;
drop policy if exists incidents_staff_insert on public.incidents;
create policy incidents_staff_insert on public.incidents for insert with check(public.current_role() in('staff','supervisor') and organisation_id=public.current_org_id() and reported_by=auth.uid());
drop policy if exists medication_incidents_staff_insert on public.medication_incidents;
create policy medication_incidents_staff_insert on public.medication_incidents for insert with check(public.current_role() in('staff','supervisor') and organisation_id=public.current_org_id() and reported_by=auth.uid());

drop policy if exists complaints_org_select on public.complaints;
create policy complaints_org_select on public.complaints for select using(public.is_supervisor() and organisation_id=public.current_org_id() or submitted_by=auth.uid());
drop policy if exists complaints_insert on public.complaints;
create policy complaints_insert on public.complaints for insert with check(organisation_id=public.current_org_id() and (submitted_by=auth.uid() or public.is_supervisor()));
drop policy if exists complaints_supervisor_all on public.complaints;
create policy complaints_supervisor_all on public.complaints for all using(public.is_supervisor() and organisation_id=public.current_org_id()) with check(public.is_supervisor() and organisation_id=public.current_org_id());

do $$ declare t text; begin
 foreach t in array array['timesheets','worker_availability','leave_requests','travel_expenses']
 loop
  execute format('drop policy if exists %I_own_select on public.%I',t,t);
  execute format('create policy %I_own_select on public.%I for select using (organisation_id=public.current_org_id() and (staff_id=auth.uid() or public.is_supervisor()))',t,t);
  execute format('drop policy if exists %I_own_insert on public.%I',t,t);
  execute format('create policy %I_own_insert on public.%I for insert with check (organisation_id=public.current_org_id() and staff_id=auth.uid())',t,t);
  execute format('drop policy if exists %I_supervisor_all on public.%I',t,t);
  execute format('create policy %I_supervisor_all on public.%I for all using (public.is_supervisor() and organisation_id=public.current_org_id()) with check (public.is_supervisor() and organisation_id=public.current_org_id())',t,t);
 end loop;
end $$;
drop policy if exists audit_events_supervisor_select on public.audit_events;
create policy audit_events_supervisor_select on public.audit_events for select using(public.is_supervisor() and organisation_id=public.current_org_id());

create index if not exists incidents_org_date_idx on public.incidents(organisation_id,occurred_at desc);
create index if not exists complaints_org_date_idx on public.complaints(organisation_id,received_at desc);
create index if not exists timesheets_staff_date_idx on public.timesheets(staff_id,clock_in desc);
create index if not exists audit_events_org_date_idx on public.audit_events(organisation_id,occurred_at desc);

-- Staff workflow permissions
drop policy if exists timesheets_own_update on public.timesheets;
create policy timesheets_own_update on public.timesheets for update
using(organisation_id=public.current_org_id() and staff_id=auth.uid() and status in('Open','Submitted'))
with check(organisation_id=public.current_org_id() and staff_id=auth.uid() and status in('Open','Submitted'));
drop policy if exists participant_goals_staff_insert on public.participant_goals;
create policy participant_goals_staff_insert on public.participant_goals for insert
with check(public.current_role() in('staff','supervisor') and organisation_id=public.current_org_id() and created_by=auth.uid());

-- Open-shift broadcasting and safe claiming
alter table public.shifts alter column assigned_staff_id drop not null;
drop policy if exists shifts_select on public.shifts;
create policy shifts_select on public.shifts for select using(
 organisation_id=public.current_org_id() and (
  public.is_supervisor() or assigned_staff_id=auth.uid() or participant_id=public.current_participant_id()
  or (public.current_role() in('staff','supervisor') and assigned_staff_id is null and status='Published')
 )
);
drop policy if exists shifts_staff_claim on public.shifts;
create policy shifts_staff_claim on public.shifts for update
using(organisation_id=public.current_org_id() and assigned_staff_id is null and status='Published' and public.current_role() in('staff','supervisor'))
with check(organisation_id=public.current_org_id() and assigned_staff_id=auth.uid() and status='Published');

-- Schedule 8 controlled-drug stock register
create table if not exists public.controlled_drug_register (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id) on delete cascade, medication_id uuid not null references public.medications(id) on delete cascade,
 transaction_at timestamptz not null default now(), transaction_type text not null check(transaction_type in('Received','Administered','Destroyed','Adjustment','Count check')),
 quantity numeric(10,2) not null default 0, balance numeric(10,2) not null, reason text,
 recorded_by uuid not null references public.profiles(id) on delete restrict, witnessed_by uuid references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now()
);
alter table public.controlled_drug_register enable row level security;
drop policy if exists controlled_drug_register_org_select on public.controlled_drug_register;
create policy controlled_drug_register_org_select on public.controlled_drug_register for select
using(public.current_role() in('staff','supervisor') and organisation_id=public.current_org_id());
drop policy if exists controlled_drug_register_staff_insert on public.controlled_drug_register;
create policy controlled_drug_register_staff_insert on public.controlled_drug_register for insert
with check(public.current_role() in('staff','supervisor') and organisation_id=public.current_org_id() and recorded_by=auth.uid() and witnessed_by is not null and witnessed_by<>auth.uid());
drop trigger if exists controlled_drug_register_audit on public.controlled_drug_register;
create trigger controlled_drug_register_audit after insert or update or delete on public.controlled_drug_register for each row execute function public.audit_row_change();
create index if not exists controlled_drug_register_medication_idx on public.controlled_drug_register(medication_id,transaction_at desc);

-- Least-privilege reads for staff and participant-linked portal accounts
drop policy if exists incidents_org_select on public.incidents;
create policy incidents_org_select on public.incidents for select using(public.current_role() in('staff','supervisor') and organisation_id=public.current_org_id());
drop policy if exists medication_incidents_org_select on public.medication_incidents;
create policy medication_incidents_org_select on public.medication_incidents for select using(public.current_role() in('staff','supervisor') and organisation_id=public.current_org_id());
drop policy if exists staff_credentials_org_select on public.staff_credentials;
create policy staff_credentials_org_select on public.staff_credentials for select using(public.current_role() in('staff','supervisor') and organisation_id=public.current_org_id());
drop policy if exists emergency_plans_org_select on public.emergency_plans;
create policy emergency_plans_org_select on public.emergency_plans for select using(organisation_id=public.current_org_id() and (public.current_role() in('staff','supervisor') or participant_id=public.current_participant_id()));
drop policy if exists participant_goals_org_select on public.participant_goals;
create policy participant_goals_org_select on public.participant_goals for select using(organisation_id=public.current_org_id() and (public.current_role() in('staff','supervisor') or participant_id=public.current_participant_id()));
drop policy if exists funding_plans_org_select on public.funding_plans;
create policy funding_plans_org_select on public.funding_plans for select using(organisation_id=public.current_org_id() and (public.current_role() in('staff','supervisor') or participant_id=public.current_participant_id()));
drop policy if exists ndis_support_items_org_select on public.ndis_support_items;
create policy ndis_support_items_org_select on public.ndis_support_items for select using(public.current_role() in('staff','supervisor') and organisation_id=public.current_org_id());

create or replace function public.notify_supervisors_of_operation() returns trigger language plpgsql security definer set search_path=public as $$
declare heading text; detail text; category_name text; org uuid; related uuid;
begin
 org:=new.organisation_id; related:=new.id;
 if tg_table_name='incidents' then heading:='New incident requires review';detail:=new.category||' incident rated '||new.severity;category_name:='Incident';
 elsif tg_table_name='medication_incidents' then heading:='Medication error requires review';detail:=new.incident_type;category_name:='Medication';
 elsif tg_table_name='complaints' then heading:='New complaint or feedback';detail:=new.subject;category_name:='Complaint';
 elsif tg_table_name='leave_requests' then heading:='Leave request awaiting review';detail:=new.leave_type;category_name:='Workforce';
 elsif tg_table_name='timesheets' then heading:='Timesheet submitted';detail:='A timesheet is ready for approval';category_name:='Timesheet';
 else return new; end if;
 if tg_op='INSERT' or (tg_table_name='timesheets' and old.status is distinct from new.status and new.status='Submitted') then
  insert into public.notifications(organisation_id,recipient_id,title,body,category,related_record_id)
  select org,id,heading,detail,category_name,related from public.profiles
  where organisation_id=org and role='supervisor' and active=true and id<>auth.uid();
 end if;
 return new;
end $$;
drop trigger if exists incidents_notify on public.incidents;
create trigger incidents_notify after insert on public.incidents for each row execute function public.notify_supervisors_of_operation();
drop trigger if exists medication_incidents_notify on public.medication_incidents;
create trigger medication_incidents_notify after insert on public.medication_incidents for each row execute function public.notify_supervisors_of_operation();
drop trigger if exists complaints_notify on public.complaints;
create trigger complaints_notify after insert on public.complaints for each row execute function public.notify_supervisors_of_operation();
drop trigger if exists leave_requests_notify on public.leave_requests;
create trigger leave_requests_notify after insert on public.leave_requests for each row execute function public.notify_supervisors_of_operation();
drop trigger if exists timesheets_notify on public.timesheets;
create trigger timesheets_notify after insert or update on public.timesheets for each row execute function public.notify_supervisors_of_operation();
