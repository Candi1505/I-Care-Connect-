-- Florence operational controls upgrade
-- Non-destructive: adds governance registers, meeting minutes, delegations and pay-period settings.

alter table public.organisations
  add column if not exists pay_period_anchor date;

create table if not exists public.conflict_declarations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete restrict,
  declaration_type text not null check (declaration_type in ('No conflict declared','Actual conflict','Potential conflict','Perceived conflict')),
  details text,
  management_actions text,
  status text not null default 'Current',
  declared_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  meeting_type text not null check (meeting_type in ('Management meeting','Staff meeting')),
  meeting_at timestamptz not null,
  attendees text not null,
  apologies text,
  agenda text not null,
  discussion text not null,
  decisions text,
  actions text,
  next_meeting_at timestamptz,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.delegations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  delegator_id uuid not null references public.profiles(id) on delete restrict,
  delegate_id uuid not null references public.profiles(id) on delete restrict,
  responsibility text not null,
  authority_limits text not null,
  starts_on date not null,
  ends_on date,
  status text not null default 'Active',
  confirmed_by_delegate boolean not null default false,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delegation_people_differ check (delegator_id <> delegate_id),
  constraint delegation_dates_valid check (ends_on is null or ends_on >= starts_on)
);

alter table public.conflict_declarations enable row level security;
alter table public.meeting_minutes enable row level security;
alter table public.delegations enable row level security;

drop policy if exists conflict_declarations_select on public.conflict_declarations;
create policy conflict_declarations_select on public.conflict_declarations
for select using (
  organisation_id=public.current_org_id()
  and (staff_id=auth.uid() or public.is_supervisor())
);

drop policy if exists conflict_declarations_insert on public.conflict_declarations;
create policy conflict_declarations_insert on public.conflict_declarations
for insert with check (
  organisation_id=public.current_org_id()
  and staff_id=auth.uid()
  and public.current_role() in ('staff','supervisor')
);

drop policy if exists conflict_declarations_supervisor_update on public.conflict_declarations;
create policy conflict_declarations_supervisor_update on public.conflict_declarations
for update using (
  public.is_supervisor() and organisation_id=public.current_org_id()
) with check (
  public.is_supervisor() and organisation_id=public.current_org_id()
);

drop policy if exists meeting_minutes_supervisor_all on public.meeting_minutes;
create policy meeting_minutes_supervisor_all on public.meeting_minutes
for all using (
  public.is_supervisor() and organisation_id=public.current_org_id()
) with check (
  public.is_supervisor() and organisation_id=public.current_org_id()
);

drop policy if exists delegations_select on public.delegations;
create policy delegations_select on public.delegations
for select using (
  organisation_id=public.current_org_id()
  and (public.is_supervisor() or delegator_id=auth.uid() or delegate_id=auth.uid())
);

drop policy if exists delegations_supervisor_all on public.delegations;
create policy delegations_supervisor_all on public.delegations
for all using (
  public.is_supervisor() and organisation_id=public.current_org_id()
) with check (
  public.is_supervisor() and organisation_id=public.current_org_id()
);

do $audit$
declare table_name text;
begin
  if to_regprocedure('public.audit_row_change()') is null then
    return;
  end if;
  foreach table_name in array array['conflict_declarations','meeting_minutes','delegations']
  loop
    execute format('drop trigger if exists %I_audit on public.%I',table_name,table_name);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      table_name,
      table_name
    );
  end loop;
end;
$audit$;

grant select,insert on public.conflict_declarations to authenticated;
grant update on public.conflict_declarations to authenticated;
grant select,insert,update,delete on public.meeting_minutes to authenticated;
grant select,insert,update,delete on public.delegations to authenticated;
