-- Minimal Supabase compatibility layer for migration smoke tests.
-- This is used only in GitHub Actions against an ephemeral PostgreSQL service.

create extension if not exists pgcrypto;

do $$
begin
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users(
 id uuid primary key,
 email text,
 raw_user_meta_data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;

grant usage on schema auth to anon,authenticated,service_role;
grant execute on function auth.uid() to anon,authenticated,service_role;
grant execute on function auth.jwt() to anon,authenticated,service_role;

create table if not exists storage.buckets(
 id text primary key,
 name text not null,
 public boolean not null default false,
 file_size_limit bigint,
 allowed_mime_types text[]
);

create table if not exists storage.objects(
 id uuid primary key default gen_random_uuid(),
 bucket_id text not null references storage.buckets(id) on delete cascade,
 name text not null,
 owner uuid,
 metadata jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(bucket_id,name)
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
 select case
  when array_length(string_to_array(name,'/'),1)>1
   then (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
  else array[]::text[]
 end
$$;

grant usage on schema storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to authenticated,service_role;
grant select on storage.buckets to anon,authenticated,service_role;
grant execute on function storage.foldername(text) to anon,authenticated,service_role;

-- The base rebuild drops this type after dropping legacy function signatures.
-- Precreating it lets a genuinely empty PostgreSQL database parse those drops.
do $$
begin
 if not exists(
  select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='public' and t.typname='mar_status'
 ) then
  create type public.mar_status as enum('Temporary');
 end if;
end $$;
