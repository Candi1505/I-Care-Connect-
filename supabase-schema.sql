-- FLORENCE DATABASE V1
-- CLEAN REBUILD FOR I-CARE CONNECT
-- WARNING: This removes existing Florence app tables and recreates them.
-- It does not delete Supabase Auth users.

create extension if not exists pgcrypto;

-- =========================================================
-- 1. CLEAN UP OLD FLORENCE OBJECTS
-- =========================================================

drop function if exists public.record_medication_administration(uuid,text,public.mar_status) cascade;
drop function if exists public.record_medication_administration(uuid,text,text) cascade;
drop function if exists public.current_org_id() cascade;
drop function if exists public.current_participant_id() cascade;
drop function if exists public.current_role() cascade;
drop function if exists public.is_supervisor() cascade;
drop function if exists public.touch_updated_at() cascade;

drop table if exists public.portal_messages cascade;
drop table if exists public.portal_threads cascade;
drop table if exists public.client_timeline cascade;
drop table if exists public.notifications cascade;
drop table if exists public.invoices cascade;
drop table if exists public.compliance_documents cascade;
drop table if exists public.progress_notes cascade;
drop table if exists public.mar_entries cascade;
drop table if exists public.medications cascade;
drop table if exists public.shifts cascade;
drop table if exists public.profiles cascade;
drop table if exists public.participants cascade;
drop table if exists public.organisations cascade;

drop type if exists public.app_role cascade;
drop type if exists public.shift_status cascade;
drop type if exists public.shift_response cascade;
drop type if exists public.mar_status cascade;
drop type if exists public.portal_thread_status cascade;
drop type if exists public.portal_thread_type cascade;
drop type if exists public.timeline_event_type cascade;
drop type if exists public.timeline_severity cascade;

-- =========================================================
-- 2. ENUMS
-- =========================================================

create type public.app_role as enum (
  'supervisor',
  'staff',
  'family',
  'client'
);

create type public.shift_status as enum (
  'Draft',
  'Published',
  'Completed',
  'Cancelled'
);

create type public.shift_response as enum (
  'Not sent',
  'Pending',
  'Accepted',
  'Declined'
);

create type public.mar_status as enum (
  'Administered',
  'Withheld',
  'Refused',
  'Missed'
);

create type public.portal_thread_status as enum (
  'Open',
  'In progress',
  'Resolved',
  'Closed'
);

create type public.portal_thread_type as enum (
  'Message',
  'Request',
  'Information update',
  'Appointment request',
  'Roster request',
  'General question'
);

create type public.timeline_event_type as enum (
  'Fall',
  'Behaviour',
  'Medication',
  'Health',
  'Incident',
  'Hospital',
  'Appointment',
  'Family update',
  'Other'
);

create type public.timeline_severity as enum (
  'Low',
  'Moderate',
  'High'
);

-- =========================================================
-- 3. CORE TABLES
-- =========================================================

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  abn text,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  full_name text not null,
  preferred_name text,
  date_of_birth date,
  ndis_number text,
  address text,
  phone text,
  emergency_contact text,
  guardian_nominee text,
  gp text,
  pharmacy text,
  communication_needs text,
  diagnoses text,
  allergies text,
  goals text,
  preferences text,
  risks_and_safeguards text,
  funding_start date,
  funding_end date,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  role public.app_role not null default 'staff',
  medication_pin_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_client_participant_required check (
    role not in ('family','client') or participant_id is not null
  )
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  assigned_staff_id uuid not null references public.profiles(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  shift_type text not null,
  instructions text,
  status public.shift_status not null default 'Draft',
  response public.shift_response not null default 'Not sent',
  published_at timestamptz,
  responded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_end_after_start check (ends_at > starts_at)
);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  medication_name text not null,
  dose text not null,
  route text not null,
  administration_time time,
  medication_type text not null,
  instructions text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.mar_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete restrict,
  status public.mar_status not null,
  pin_verified boolean not null default false,
  notes text,
  recorded_at timestamptz not null default now()
);

create table public.progress_notes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete restrict,
  shift_id uuid references public.shifts(id) on delete set null,
  category text not null,
  content text not null,
  status text not null default 'Final',
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.client_timeline (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  event_type public.timeline_event_type not null,
  severity public.timeline_severity,
  occurred_at timestamptz not null,
  title text not null,
  description text not null,
  action_taken text,
  follow_up text,
  related_progress_note_id uuid references public.progress_notes(id) on delete set null,
  related_mar_entry_id uuid references public.mar_entries(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portal_threads (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  thread_type public.portal_thread_type not null,
  subject text not null,
  status public.portal_thread_status not null default 'Open',
  created_by uuid not null references public.profiles(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  thread_id uuid not null references public.portal_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  message text not null,
  created_at timestamptz not null default now()
);

create table public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  scope text not null check (scope in ('Staff','Participant','Organisation')),
  subject_type text,
  subject_id uuid,
  subject_name text not null,
  category text not null,
  title text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  review_date date,
  version integer not null default 1,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  uploaded_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  invoice_number text not null,
  description text not null,
  hours numeric(10,2) not null,
  rate numeric(10,2) not null,
  total numeric(10,2) generated always as (hours * rate) stored,
  invoice_date date not null,
  due_date date,
  xero_invoice_id text,
  status text not null default 'Draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoice_hours_nonnegative check (hours >= 0),
  constraint invoice_rate_nonnegative check (rate >= 0)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null,
  related_record_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- =========================================================
-- 4. INDEXES
-- =========================================================

create index idx_profiles_org on public.profiles(organisation_id);
create index idx_profiles_participant on public.profiles(participant_id);
create index idx_participants_org on public.participants(organisation_id);
create index idx_shifts_org_starts on public.shifts(organisation_id, starts_at);
create index idx_shifts_staff on public.shifts(assigned_staff_id, starts_at);
create index idx_medications_participant on public.medications(participant_id, active);
create index idx_mar_participant_time on public.mar_entries(participant_id, recorded_at desc);
create index idx_notes_participant_time on public.progress_notes(participant_id, recorded_at desc);
create index idx_timeline_participant_time on public.client_timeline(participant_id, occurred_at desc);
create index idx_portal_threads_participant on public.portal_threads(participant_id, updated_at desc);
create index idx_portal_messages_thread on public.portal_messages(thread_id, created_at);
create index idx_notifications_recipient on public.notifications(recipient_id, created_at desc);

-- =========================================================
-- 5. HELPER FUNCTIONS
-- =========================================================

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organisation_id
  from public.profiles
  where id = auth.uid()
    and active = true
$$;

create or replace function public.current_participant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select participant_id
  from public.profiles
  where id = auth.uid()
    and active = true
$$;

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and active = true
$$;

create or replace function public.is_supervisor()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'supervisor', false)
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 6. UPDATED_AT TRIGGERS
-- =========================================================

create trigger organisations_touch_updated_at
before update on public.organisations
for each row execute function public.touch_updated_at();

create trigger participants_touch_updated_at
before update on public.participants
for each row execute function public.touch_updated_at();

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create trigger shifts_touch_updated_at
before update on public.shifts
for each row execute function public.touch_updated_at();

create trigger medications_touch_updated_at
before update on public.medications
for each row execute function public.touch_updated_at();

create trigger progress_notes_touch_updated_at
before update on public.progress_notes
for each row execute function public.touch_updated_at();

create trigger client_timeline_touch_updated_at
before update on public.client_timeline
for each row execute function public.touch_updated_at();

create trigger portal_threads_touch_updated_at
before update on public.portal_threads
for each row execute function public.touch_updated_at();

create trigger invoices_touch_updated_at
before update on public.invoices
for each row execute function public.touch_updated_at();

-- =========================================================
-- 7. ROW LEVEL SECURITY
-- =========================================================

alter table public.organisations enable row level security;
alter table public.participants enable row level security;
alter table public.profiles enable row level security;
alter table public.shifts enable row level security;
alter table public.medications enable row level security;
alter table public.mar_entries enable row level security;
alter table public.progress_notes enable row level security;
alter table public.client_timeline enable row level security;
alter table public.portal_threads enable row level security;
alter table public.portal_messages enable row level security;
alter table public.compliance_documents enable row level security;
alter table public.invoices enable row level security;
alter table public.notifications enable row level security;

create policy organisations_select
on public.organisations for select
using (id = public.current_org_id());

create policy organisations_supervisor_update
on public.organisations for update
using (public.is_supervisor() and id = public.current_org_id())
with check (public.is_supervisor() and id = public.current_org_id());

create policy profiles_select
on public.profiles for select
using (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or id = auth.uid()
  )
);

create policy profiles_supervisor_all
on public.profiles for all
using (public.is_supervisor() and organisation_id = public.current_org_id())
with check (public.is_supervisor() and organisation_id = public.current_org_id());

create policy participants_select
on public.participants for select
using (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or id = public.current_participant_id()
  )
);

create policy participants_supervisor_all
on public.participants for all
using (public.is_supervisor() and organisation_id = public.current_org_id())
with check (public.is_supervisor() and organisation_id = public.current_org_id());

create policy shifts_select
on public.shifts for select
using (
  organisation_id = public.current_org_id()
  and (
    public.is_supervisor()
    or assigned_staff_id = auth.uid()
    or participant_id = public.current_participant_id()
  )
);

create policy shifts_supervisor_all
on public.shifts for all
using (public.is_supervisor() and organisation_id = public.current_org_id())
with check (public.is_supervisor() and organisation_id = public.current_org_id());

create policy shifts_staff_update
on public.shifts for update
using (
  assigned_staff_id = auth.uid()
  and organisation_id = public.current_org_id()
)
with check (
  assigned_staff_id = auth.uid()
  and organisation_id = public.current_org_id()
);

create policy medications_select
on public.medications for select
using (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or participant_id = public.current_participant_id()
  )
);

create policy medications_supervisor_all
on public.medications for all
using (public.is_supervisor() and organisation_id = public.current_org_id())
with check (public.is_supervisor() and organisation_id = public.current_org_id());

create policy mar_select
on public.mar_entries for select
using (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or participant_id = public.current_participant_id()
  )
);

create policy mar_staff_insert
on public.mar_entries for insert
with check (
  organisation_id = public.current_org_id()
  and staff_id = auth.uid()
  and public.current_role() in ('supervisor','staff')
);

create policy notes_select
on public.progress_notes for select
using (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or participant_id = public.current_participant_id()
  )
);

create policy notes_staff_insert
on public.progress_notes for insert
with check (
  organisation_id = public.current_org_id()
  and staff_id = auth.uid()
  and public.current_role() in ('supervisor','staff')
);

create policy notes_staff_update_own
on public.progress_notes for update
using (
  organisation_id = public.current_org_id()
  and (
    public.is_supervisor()
    or staff_id = auth.uid()
  )
)
with check (
  organisation_id = public.current_org_id()
  and (
    public.is_supervisor()
    or staff_id = auth.uid()
  )
);

create policy timeline_select
on public.client_timeline for select
using (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or participant_id = public.current_participant_id()
  )
);

create policy timeline_staff_insert
on public.client_timeline for insert
with check (
  organisation_id = public.current_org_id()
  and created_by = auth.uid()
  and public.current_role() in ('supervisor','staff')
);

create policy timeline_staff_update
on public.client_timeline for update
using (
  organisation_id = public.current_org_id()
  and (
    public.is_supervisor()
    or created_by = auth.uid()
  )
)
with check (
  organisation_id = public.current_org_id()
  and (
    public.is_supervisor()
    or created_by = auth.uid()
  )
);

create policy portal_threads_select
on public.portal_threads for select
using (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or participant_id = public.current_participant_id()
  )
);

create policy portal_threads_insert
on public.portal_threads for insert
with check (
  organisation_id = public.current_org_id()
  and created_by = auth.uid()
  and (
    public.current_role() in ('supervisor','staff')
    or participant_id = public.current_participant_id()
  )
);

create policy portal_threads_update
on public.portal_threads for update
using (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or participant_id = public.current_participant_id()
  )
)
with check (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or participant_id = public.current_participant_id()
  )
);

create policy portal_messages_select
on public.portal_messages for select
using (
  organisation_id = public.current_org_id()
  and exists (
    select 1
    from public.portal_threads t
    where t.id = thread_id
      and t.organisation_id = public.current_org_id()
      and (
        public.current_role() in ('supervisor','staff')
        or t.participant_id = public.current_participant_id()
      )
  )
);

create policy portal_messages_insert
on public.portal_messages for insert
with check (
  organisation_id = public.current_org_id()
  and sender_id = auth.uid()
  and exists (
    select 1
    from public.portal_threads t
    where t.id = thread_id
      and t.organisation_id = public.current_org_id()
      and (
        public.current_role() in ('supervisor','staff')
        or t.participant_id = public.current_participant_id()
      )
  )
);

create policy compliance_select
on public.compliance_documents for select
using (
  organisation_id = public.current_org_id()
  and (
    public.current_role() in ('supervisor','staff')
    or (
      scope = 'Participant'
      and subject_id = public.current_participant_id()
    )
  )
);

create policy compliance_supervisor_all
on public.compliance_documents for all
using (public.is_supervisor() and organisation_id = public.current_org_id())
with check (public.is_supervisor() and organisation_id = public.current_org_id());

create policy invoices_supervisor_all
on public.invoices for all
using (public.is_supervisor() and organisation_id = public.current_org_id())
with check (public.is_supervisor() and organisation_id = public.current_org_id());

create policy notifications_select_own
on public.notifications for select
using (
  organisation_id = public.current_org_id()
  and recipient_id = auth.uid()
);

create policy notifications_update_own
on public.notifications for update
using (
  organisation_id = public.current_org_id()
  and recipient_id = auth.uid()
)
with check (
  organisation_id = public.current_org_id()
  and recipient_id = auth.uid()
);

create policy notifications_supervisor_insert
on public.notifications for insert
with check (
  public.is_supervisor()
  and organisation_id = public.current_org_id()
);

-- =========================================================
-- 8. PRIVATE STORAGE
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'florence-private',
  'florence-private',
  false,
  8388608,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/heic',
    'text/plain'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists florence_storage_read on storage.objects;
drop policy if exists florence_storage_insert on storage.objects;
drop policy if exists florence_storage_update on storage.objects;
drop policy if exists florence_storage_delete on storage.objects;

create policy florence_storage_read
on storage.objects for select
to authenticated
using (
  bucket_id = 'florence-private'
  and (storage.foldername(name))[1] = public.current_org_id()::text
);

create policy florence_storage_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'florence-private'
  and public.is_supervisor()
  and (storage.foldername(name))[1] = public.current_org_id()::text
);

create policy florence_storage_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'florence-private'
  and public.is_supervisor()
  and (storage.foldername(name))[1] = public.current_org_id()::text
)
with check (
  bucket_id = 'florence-private'
  and public.is_supervisor()
  and (storage.foldername(name))[1] = public.current_org_id()::text
);

create policy florence_storage_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'florence-private'
  and public.is_supervisor()
  and (storage.foldername(name))[1] = public.current_org_id()::text
);

-- =========================================================
-- 9. MEDICATION PIN FUNCTION
-- =========================================================

create or replace function public.record_medication_administration(
  p_medication_id uuid,
  p_pin text,
  p_status public.mar_status default 'Administered',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_medication public.medications;
  v_entry_id uuid;
begin
  select *
  into v_profile
  from public.profiles
  where id = auth.uid()
    and active = true;

  if v_profile.id is null then
    raise exception 'Florence profile is not active';
  end if;

  if v_profile.role not in ('supervisor','staff') then
    raise exception 'Only staff can record medication administration';
  end if;

  if v_profile.medication_pin_hash is null
     or crypt(p_pin, v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'Incorrect medication PIN';
  end if;

  select *
  into v_medication
  from public.medications
  where id = p_medication_id
    and organisation_id = v_profile.organisation_id
    and active = true;

  if v_medication.id is null then
    raise exception 'Medication is not available';
  end if;

  insert into public.mar_entries (
    organisation_id,
    medication_id,
    participant_id,
    staff_id,
    status,
    pin_verified,
    notes
  )
  values (
    v_profile.organisation_id,
    v_medication.id,
    v_medication.participant_id,
    v_profile.id,
    p_status,
    true,
    p_notes
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

grant execute on function public.record_medication_administration(
  uuid,
  text,
  public.mar_status,
  text
) to authenticated;

-- =========================================================
-- 10. INITIAL ORGANISATION
-- =========================================================

insert into public.organisations (name)
values ('I-Care Connect')
on conflict (name) do nothing;

-- =========================================================
-- DATABASE BUILD COMPLETE
-- =========================================================
