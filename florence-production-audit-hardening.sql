-- Florence production audit hardening — 4 August 2026
-- Safe to run once through the Supabase migration runner.

begin;

-- Trigger functions are internal implementation details, not public RPC endpoints.
revoke execute on function public.queue_deputy_shift_sync() from public, anon, authenticated;
grant execute on function public.queue_deputy_shift_sync() to service_role;

-- Remove only byte-for-byte duplicate, non-constraint indexes confirmed in production.
drop index if exists public.mar_entries_participant_recorded_idx;
drop index if exists public.progress_notes_participant_recorded_idx;
drop index if exists public.portal_messages_thread_created_idx;
drop index if exists public.notifications_recipient_created_idx;

-- Foreign-key indexes for Florence's highest-traffic clinical, roster, portal,
-- Deputy and invoicing relationships. These also make cascades/deletes predictable.
create index if not exists deputy_employee_mappings_matched_by_idx on public.deputy_employee_mappings(matched_by);
create index if not exists deputy_employee_mappings_profile_idx on public.deputy_employee_mappings(profile_id);
create index if not exists deputy_shift_syncs_organisation_idx on public.deputy_shift_syncs(organisation_id);
create index if not exists invoice_items_organisation_idx on public.invoice_items(organisation_id);
create index if not exists invoice_service_templates_created_by_idx on public.invoice_service_templates(created_by);
create index if not exists invoice_service_templates_participant_idx on public.invoice_service_templates(participant_id);
create index if not exists invoice_shift_links_item_idx on public.invoice_shift_links(invoice_item_id);
create index if not exists invoice_shift_links_organisation_idx on public.invoice_shift_links(organisation_id);
create index if not exists invoices_created_by_idx on public.invoices(created_by);
create index if not exists invoices_emailed_by_idx on public.invoices(emailed_by);
create index if not exists invoices_organisation_idx on public.invoices(organisation_id);
create index if not exists invoices_participant_idx on public.invoices(participant_id);
create index if not exists mar_entries_organisation_idx on public.mar_entries(organisation_id);
create index if not exists mar_entries_staff_idx on public.mar_entries(staff_id);
create index if not exists mar_entries_witnessed_by_idx on public.mar_entries(witnessed_by);
create index if not exists medications_created_by_idx on public.medications(created_by);
create index if not exists notifications_organisation_idx on public.notifications(organisation_id);
create index if not exists portal_messages_organisation_idx on public.portal_messages(organisation_id);
create index if not exists portal_messages_sender_idx on public.portal_messages(sender_id);
create index if not exists progress_notes_organisation_idx on public.progress_notes(organisation_id);
create index if not exists progress_notes_shift_idx on public.progress_notes(shift_id);
create index if not exists shifts_created_by_idx on public.shifts(created_by);

-- Defence-in-depth NDIS validation. The browser performs the same checks, but
-- direct Data API writes must not bypass catalogue maxima or the SIL code change.
create or replace function public.enforce_invoice_item_pricing()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  national_max numeric;
  absolute_max numeric;
  applicable_max numeric;
  participant_ndis text;
  participant_name text;
begin
  national_max := case new.support_item_number
    when '01_801_0138_1_1' then 73.58
    when '01_802_0138_1_1' then 81.07
    when '01_803_0138_1_1' then 82.57
    when '01_804_0138_1_1' then 103.54
    when '01_805_0138_1_1' then 133.50
    when '01_806_0138_1_1' then 163.46
    when '01_832_0138_1_1' then 311.79
    when '04_104_0125_6_1' then 73.58
    else null
  end;

  absolute_max := case new.support_item_number
    when '01_801_0138_1_1' then 110.37
    when '01_802_0138_1_1' then 121.61
    when '01_803_0138_1_1' then 123.86
    when '01_804_0138_1_1' then 155.31
    when '01_805_0138_1_1' then 200.25
    when '01_806_0138_1_1' then 245.19
    when '01_832_0138_1_1' then 467.69
    when '04_104_0125_6_1' then 110.37
    else null
  end;
  select regexp_replace(coalesce(p.ndis_number,''),'\s','','g'), lower(coalesce(p.full_name,''))
    into participant_ndis, participant_name
    from public.invoices i
    left join public.participants p on p.id=i.participant_id
    where i.id=new.invoice_id;
  applicable_max := case
    when participant_ndis='430178932' or participant_name like '%evelyn%' then national_max
    else absolute_max
  end;

  if new.quantity <= 0 or new.unit_price <= 0 then
    raise exception 'Invoice quantity and unit price must be greater than zero'
      using errcode = '23514';
  end if;
  if applicable_max is not null and new.unit_price > applicable_max then
    raise exception 'Support item % exceeds its 2026-27 maximum of $%', new.support_item_number, applicable_max
      using errcode = '23514';
  end if;
  if new.support_item_number like '%\_0138\_%' escape '\' and new.service_date < date '2026-07-01' then
    raise exception 'SIL services before 1 July 2026 must use registration group 0115'
      using errcode = '23514';
  end if;
  if new.support_item_number like '%\_0115\_%' escape '\' and new.service_date >= date '2026-07-01' then
    raise exception 'SIL services from 1 July 2026 must use registration group 0138'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_invoice_item_pricing() from public, anon, authenticated;
grant execute on function public.enforce_invoice_item_pricing() to service_role;
drop trigger if exists enforce_invoice_item_pricing_trigger on public.invoice_items;
create trigger enforce_invoice_item_pricing_trigger
before insert or update of support_item_number, service_date, quantity, unit_price
on public.invoice_items
for each row execute function public.enforce_invoice_item_pricing();

create or replace function public.enforce_invoice_template_pricing()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  national_max numeric;
  absolute_max numeric;
begin
  national_max := case new.support_item_number
    when '01_801_0138_1_1' then 73.58
    when '01_802_0138_1_1' then 81.07
    when '01_803_0138_1_1' then 82.57
    when '01_804_0138_1_1' then 103.54
    when '01_805_0138_1_1' then 133.50
    when '01_806_0138_1_1' then 163.46
    when '01_832_0138_1_1' then 311.79
    when '04_104_0125_6_1' then 73.58
    else null
  end;

  absolute_max := case new.support_item_number
    when '01_801_0138_1_1' then 110.37
    when '01_802_0138_1_1' then 121.61
    when '01_803_0138_1_1' then 123.86
    when '01_804_0138_1_1' then 155.31
    when '01_805_0138_1_1' then 200.25
    when '01_806_0138_1_1' then 245.19
    when '01_832_0138_1_1' then 467.69
    when '04_104_0125_6_1' then 110.37
    else null
  end;

  if new.unit_price <= 0 then
    raise exception 'Template unit price must be greater than zero'
      using errcode = '23514';
  end if;
  if absolute_max is not null and new.unit_price > absolute_max then
    raise exception 'Support item % exceeds the highest 2026-27 location maximum of $%', new.support_item_number, absolute_max
      using errcode = '23514';
  end if;
  if new.support_item_number like '%\_0138\_%' escape '\'
     and new.pricing_effective_from is not null
     and new.pricing_effective_from < date '2026-07-01' then
    raise exception '0138 SIL templates cannot start before 1 July 2026'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_invoice_template_pricing() from public, anon, authenticated;
grant execute on function public.enforce_invoice_template_pricing() to service_role;
drop trigger if exists enforce_invoice_template_pricing_trigger on public.invoice_service_templates;
create trigger enforce_invoice_template_pricing_trigger
before insert or update of support_item_number, unit_price, pricing_effective_from
on public.invoice_service_templates
for each row execute function public.enforce_invoice_template_pricing();

-- Xero is service-role only. Browser users reach it through the MFA-protected
-- Edge Function; OAuth credentials and tokens are never exposed through REST.
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
revoke all on table public.xero_connections from public, anon, authenticated;
revoke all on table public.xero_oauth_states from public, anon, authenticated;
grant all on table public.xero_connections to service_role;
grant all on table public.xero_oauth_states to service_role;
create index if not exists xero_connections_connected_by_idx on public.xero_connections(connected_by);
create index if not exists xero_oauth_states_expires_idx on public.xero_oauth_states(expires_at);
create index if not exists xero_oauth_states_organisation_idx on public.xero_oauth_states(organisation_id);
create index if not exists xero_oauth_states_user_idx on public.xero_oauth_states(user_id);

commit;
