-- Florence 10.0 Supabase foundation
create extension if not exists "pgcrypto";

create type app_role as enum ('supervisor','staff');
create type shift_status as enum ('Draft','Published','Completed','Cancelled');
create type shift_response as enum ('Not sent','Pending','Accepted','Declined');
create type mar_status as enum ('Administered','Withheld','Refused');

create table organisations (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 created_at timestamptz not null default now()
);
create table profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 organisation_id uuid not null references organisations(id),
 full_name text not null,
 role app_role not null default 'staff',
 medication_pin_hash text,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table participants (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references organisations(id),
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
 created_at timestamptz not null default now()
);
create table shifts (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references organisations(id),
 participant_id uuid not null references participants(id),
 assigned_staff_id uuid not null references profiles(id),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 shift_type text not null,
 instructions text,
 status shift_status not null default 'Draft',
 response shift_response not null default 'Not sent',
 published_at timestamptz,
 responded_at timestamptz,
 created_by uuid references profiles(id),
 created_at timestamptz not null default now()
);
create table medications (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references organisations(id),
 participant_id uuid not null references participants(id),
 medication_name text not null,
 dose text not null,
 route text not null,
 administration_time time,
 medication_type text not null,
 instructions text,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table mar_entries (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references organisations(id),
 medication_id uuid not null references medications(id),
 participant_id uuid not null references participants(id),
 staff_id uuid not null references profiles(id),
 status mar_status not null,
 pin_verified boolean not null default false,
 recorded_at timestamptz not null default now(),
 notes text
);
create table progress_notes (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references organisations(id),
 participant_id uuid not null references participants(id),
 staff_id uuid not null references profiles(id),
 category text not null,
 content text not null,
 status text not null default 'Final',
 recorded_at timestamptz not null default now()
);
create table compliance_documents (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references organisations(id),
 scope text not null check(scope in ('Staff','Participant','Organisation')),
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
 uploaded_by uuid references profiles(id),
 uploaded_at timestamptz not null default now()
);
create table invoices (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references organisations(id),
 participant_id uuid references participants(id),
 invoice_number text not null,
 description text not null,
 hours numeric(10,2) not null,
 rate numeric(10,2) not null,
 total numeric(10,2) generated always as (hours*rate) stored,
 invoice_date date not null,
 xero_invoice_id text,
 status text not null default 'Draft',
 created_at timestamptz not null default now()
);

alter table organisations enable row level security;
alter table profiles enable row level security;
alter table participants enable row level security;
alter table shifts enable row level security;
alter table medications enable row level security;
alter table mar_entries enable row level security;
alter table progress_notes enable row level security;
alter table compliance_documents enable row level security;
alter table invoices enable row level security;

-- Production setup must add organisation-scoped RLS policies and private
-- Supabase Storage buckets before real participant records are entered.
