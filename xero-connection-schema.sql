-- Run once in Supabase SQL Editor before deploying the xero-connect Edge Function.
create table if not exists public.xero_connections (
  organisation_id uuid primary key references public.organisations(id) on delete cascade,
  tenant_id text not null,
  tenant_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text,
  connected_by uuid references public.profiles(id) on delete set null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.xero_oauth_states (
  state text primary key,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.xero_connections enable row level security;
alter table public.xero_oauth_states enable row level security;
-- These tables are intentionally service-role only. The Edge Function is the security boundary.
create index if not exists xero_oauth_states_expires_idx on public.xero_oauth_states(expires_at);
