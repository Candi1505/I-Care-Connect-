-- FLORENCE 10.1 LIVE TRIAL
-- Run once in Supabase SQL Editor on a new/empty Florence project.

create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('supervisor','staff','family','client'); exception when duplicate_object then null; end $$;
do $$ begin create type public.shift_status as enum ('Draft','Published','Completed','Cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.shift_response as enum ('Not sent','Pending','Accepted','Declined'); exception when duplicate_object then null; end $$;
do $$ begin create type public.mar_status as enum ('Administered','Withheld','Refused'); exception when duplicate_object then null; end $$;

create table if not exists public.organisations(
 id uuid primary key default gen_random_uuid(), name text not null unique, created_at timestamptz not null default now()
);
create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 full_name text not null, email text, role public.app_role not null default 'staff',
 medication_pin_hash text, participant_id uuid, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.participants(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 full_name text not null, preferred_name text, date_of_birth date, ndis_number text, address text, phone text,
 emergency_contact text, guardian_nominee text, gp text, pharmacy text, communication_needs text, diagnoses text,
 allergies text, goals text, preferences text, risks_and_safeguards text, funding_start date, funding_end date,
 status text not null default 'Active', created_at timestamptz not null default now()
);
create table if not exists public.shifts(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id), assigned_staff_id uuid not null references public.profiles(id),
 starts_at timestamptz not null, ends_at timestamptz not null, shift_type text not null, instructions text,
 status public.shift_status not null default 'Draft', response public.shift_response not null default 'Not sent',
 published_at timestamptz, responded_at timestamptz, created_by uuid references public.profiles(id), created_at timestamptz default now()
);
create table if not exists public.medications(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id), medication_name text not null, dose text not null,
 route text not null, administration_time time, medication_type text not null, instructions text, active boolean default true,
 created_at timestamptz default now()
);
create table if not exists public.mar_entries(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 medication_id uuid not null references public.medications(id), participant_id uuid not null references public.participants(id),
 staff_id uuid not null references public.profiles(id), status public.mar_status not null, pin_verified boolean default false,
 recorded_at timestamptz default now(), notes text
);
create table if not exists public.progress_notes(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id), staff_id uuid not null references public.profiles(id),
 category text not null, content text not null, status text default 'Final', recorded_at timestamptz default now()
);
create table if not exists public.compliance_documents(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 scope text not null check(scope in('Staff','Participant','Organisation')), subject_type text, subject_id uuid,
 subject_name text not null, category text not null, title text not null, storage_path text not null,
 original_filename text not null, mime_type text not null, review_date date, version integer default 1,
 uploaded_by uuid references public.profiles(id), uploaded_at timestamptz default now()
);
create table if not exists public.invoices(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid references public.participants(id), invoice_number text not null, description text not null,
 hours numeric(10,2) not null, rate numeric(10,2) not null, total numeric(10,2) generated always as(hours*rate) stored,
 invoice_date date not null, xero_invoice_id text, status text default 'Draft', created_at timestamptz default now()
);

create or replace function public.current_org_id() returns uuid language sql stable security definer set search_path=public
as $$ select organisation_id from public.profiles where id=auth.uid() and active=true $$;
create or replace function public.is_supervisor() returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and active=true and role='supervisor') $$;

alter table public.organisations enable row level security;
alter table public.profiles enable row level security;
alter table public.participants enable row level security;
alter table public.shifts enable row level security;
alter table public.medications enable row level security;
alter table public.mar_entries enable row level security;
alter table public.progress_notes enable row level security;
alter table public.compliance_documents enable row level security;
alter table public.invoices enable row level security;

drop policy if exists org_read on public.organisations;
create policy org_read on public.organisations for select using(id=public.current_org_id());
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using(organisation_id=public.current_org_id());
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for all using(public.is_supervisor() and organisation_id=public.current_org_id()) with check(public.is_supervisor() and organisation_id=public.current_org_id());

drop policy if exists participants_org_read on public.participants;
create policy participants_org_read on public.participants for select using(organisation_id=public.current_org_id());
drop policy if exists participants_admin_write on public.participants;
create policy participants_admin_write on public.participants for all using(public.is_supervisor() and organisation_id=public.current_org_id()) with check(public.is_supervisor() and organisation_id=public.current_org_id());

drop policy if exists shifts_org_read on public.shifts;
create policy shifts_org_read on public.shifts for select using(organisation_id=public.current_org_id() and (public.is_supervisor() or assigned_staff_id=auth.uid()));
drop policy if exists shifts_admin_write on public.shifts;
create policy shifts_admin_write on public.shifts for all using(public.is_supervisor() and organisation_id=public.current_org_id()) with check(public.is_supervisor() and organisation_id=public.current_org_id());
drop policy if exists shifts_staff_respond on public.shifts;
create policy shifts_staff_respond on public.shifts for update using(assigned_staff_id=auth.uid() and organisation_id=public.current_org_id()) with check(assigned_staff_id=auth.uid() and organisation_id=public.current_org_id());

drop policy if exists meds_org_read on public.medications;
create policy meds_org_read on public.medications for select using(organisation_id=public.current_org_id());
drop policy if exists meds_admin_write on public.medications;
create policy meds_admin_write on public.medications for all using(public.is_supervisor() and organisation_id=public.current_org_id()) with check(public.is_supervisor() and organisation_id=public.current_org_id());

drop policy if exists mar_org_read on public.mar_entries;
create policy mar_org_read on public.mar_entries for select using(organisation_id=public.current_org_id());
drop policy if exists mar_staff_insert on public.mar_entries;
create policy mar_staff_insert on public.mar_entries for insert with check(organisation_id=public.current_org_id() and staff_id=auth.uid());

drop policy if exists notes_org_read on public.progress_notes;
create policy notes_org_read on public.progress_notes for select using(organisation_id=public.current_org_id());
drop policy if exists notes_staff_insert on public.progress_notes;
create policy notes_staff_insert on public.progress_notes for insert with check(organisation_id=public.current_org_id() and staff_id=auth.uid());

drop policy if exists compliance_org_read on public.compliance_documents;
create policy compliance_org_read on public.compliance_documents for select using(organisation_id=public.current_org_id());
drop policy if exists compliance_admin_write on public.compliance_documents;
create policy compliance_admin_write on public.compliance_documents for all using(public.is_supervisor() and organisation_id=public.current_org_id()) with check(public.is_supervisor() and organisation_id=public.current_org_id());

drop policy if exists invoice_admin on public.invoices;
create policy invoice_admin on public.invoices for all using(public.is_supervisor() and organisation_id=public.current_org_id()) with check(public.is_supervisor() and organisation_id=public.current_org_id());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('florence-private','florence-private',false,8388608,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','image/heic','text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists florence_storage_read on storage.objects;
create policy florence_storage_read on storage.objects for select to authenticated using(bucket_id='florence-private' and (storage.foldername(name))[1]=public.current_org_id()::text);
drop policy if exists florence_storage_admin_insert on storage.objects;
create policy florence_storage_admin_insert on storage.objects for insert to authenticated with check(bucket_id='florence-private' and public.is_supervisor() and (storage.foldername(name))[1]=public.current_org_id()::text);
drop policy if exists florence_storage_admin_delete on storage.objects;
create policy florence_storage_admin_delete on storage.objects for delete to authenticated using(bucket_id='florence-private' and public.is_supervisor() and (storage.foldername(name))[1]=public.current_org_id()::text);

create or replace function public.record_medication_administration(p_medication_id uuid,p_pin text,p_status public.mar_status default 'Administered')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_profile public.profiles;v_med public.medications;v_id uuid;
begin
 select * into v_profile from public.profiles where id=auth.uid() and active=true;
 if v_profile.id is null then raise exception 'Staff profile not active'; end if;
 if p_status='Administered' and (v_profile.medication_pin_hash is null or crypt(p_pin,v_profile.medication_pin_hash)<>v_profile.medication_pin_hash) then raise exception 'Incorrect medication PIN'; end if;
 select * into v_med from public.medications where id=p_medication_id and organisation_id=v_profile.organisation_id and active=true;
 if v_med.id is null then raise exception 'Medication not available'; end if;
 insert into public.mar_entries(organisation_id,medication_id,participant_id,staff_id,status,pin_verified)
 values(v_profile.organisation_id,v_med.id,v_med.participant_id,v_profile.id,p_status,p_status='Administered') returning id into v_id;
 return v_id;
end $$;
grant execute on function public.record_medication_administration(uuid,text,public.mar_status) to authenticated;


-- FAMILY & CLIENT PORTAL + CLIENT TIMELINE

alter table public.profiles
  add column if not exists participant_id uuid references public.participants(id) on delete set null;

create table if not exists public.client_timeline(
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id) on delete cascade,
 event_type text not null,
 severity text,
 occurred_at timestamptz not null,
 title text not null,
 description text not null,
 action_taken text,
 follow_up text,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now()
);

create table if not exists public.portal_threads(
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 participant_id uuid not null references public.participants(id) on delete cascade,
 thread_type text not null,
 subject text not null,
 status text not null default 'Open',
 created_by uuid references public.profiles(id),
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);

create table if not exists public.portal_messages(
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 thread_id uuid not null references public.portal_threads(id) on delete cascade,
 sender_id uuid not null references public.profiles(id),
 message text not null,
 created_at timestamptz not null default now()
);

alter table public.client_timeline enable row level security;
alter table public.portal_threads enable row level security;
alter table public.portal_messages enable row level security;

drop policy if exists timeline_read on public.client_timeline;
create policy timeline_read on public.client_timeline for select using(
 organisation_id=public.current_org_id()
 and (
   public.is_supervisor()
   or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='staff')
   or participant_id=(select participant_id from public.profiles where id=auth.uid())
 )
);

drop policy if exists timeline_insert on public.client_timeline;
create policy timeline_insert on public.client_timeline for insert with check(
 organisation_id=public.current_org_id()
 and created_by=auth.uid()
 and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('supervisor','staff'))
);

drop policy if exists portal_threads_read on public.portal_threads;
create policy portal_threads_read on public.portal_threads for select using(
 organisation_id=public.current_org_id()
 and (
   exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('supervisor','staff'))
   or participant_id=(select participant_id from public.profiles where id=auth.uid())
 )
);

drop policy if exists portal_threads_insert on public.portal_threads;
create policy portal_threads_insert on public.portal_threads for insert with check(
 organisation_id=public.current_org_id()
 and created_by=auth.uid()
 and (
   exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('supervisor','staff'))
   or participant_id=(select participant_id from public.profiles where id=auth.uid())
 )
);

drop policy if exists portal_threads_update on public.portal_threads;
create policy portal_threads_update on public.portal_threads for update using(
 organisation_id=public.current_org_id()
 and (
   exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('supervisor','staff'))
   or participant_id=(select participant_id from public.profiles where id=auth.uid())
 )
);

drop policy if exists portal_messages_read on public.portal_messages;
create policy portal_messages_read on public.portal_messages for select using(
 organisation_id=public.current_org_id()
 and exists(
   select 1 from public.portal_threads t
   where t.id=thread_id and (
     exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('supervisor','staff'))
     or t.participant_id=(select participant_id from public.profiles where id=auth.uid())
   )
 )
);

drop policy if exists portal_messages_insert on public.portal_messages;
create policy portal_messages_insert on public.portal_messages for insert with check(
 organisation_id=public.current_org_id()
 and sender_id=auth.uid()
 and exists(
   select 1 from public.portal_threads t
   where t.id=thread_id and (
     exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('supervisor','staff'))
     or t.participant_id=(select participant_id from public.profiles where id=auth.uid())
   )
 )
);
