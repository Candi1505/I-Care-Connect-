begin;

alter table public.worker_service_scopes
  drop constraint if exists worker_service_scopes_service_type_check;

alter table public.worker_service_scopes
  add constraint worker_service_scopes_service_type_check
  check (service_type = any (array[
    'Domestic assistance'::text,
    'Supported Independent Living'::text,
    'Community and social support'::text
  ]));

create table if not exists public.community_support_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  staff_id uuid not null references public.profiles(id),
  supported_at timestamptz not null,
  support_type text not null check (support_type = any (array[
    'Doctor or health appointment'::text,
    'Shopping and errands'::text,
    'Cafe or meal outing'::text,
    'Recreation and community access'::text,
    'Op shopping'::text,
    'Arts and crafts'::text,
    'Other community support'::text
  ])),
  activity_title text not null,
  location text,
  participant_choices text not null,
  support_provided text not null,
  participation_outcome text not null,
  follow_up_required text,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),
  transport_recorded_separately boolean not null default false,
  status text not null default 'Complete' check (status in ('Complete', 'Follow-up required')),
  signed_by uuid not null references public.profiles(id),
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists community_support_records_participant_supported_at_idx
  on public.community_support_records(participant_id, supported_at desc);
create index if not exists community_support_records_staff_supported_at_idx
  on public.community_support_records(staff_id, supported_at desc);

alter table public.community_support_records enable row level security;
revoke all on table public.community_support_records from anon;
revoke all on table public.community_support_records from authenticated;
grant select on table public.community_support_records to authenticated;

drop policy if exists "Authorised users can view community support records" on public.community_support_records;
create policy "Authorised users can view community support records"
  on public.community_support_records
  for select
  to authenticated
  using (
    auth.uid() is not null
    and public.can_access_participant(participant_id)
    and exists (
      select 1
      from public.profiles me
      where me.id = auth.uid()
        and me.active
        and me.organisation_id = community_support_records.organisation_id
    )
  );

create or replace function public.record_community_support(
  p_participant_id uuid,
  p_supported_at timestamptz,
  p_support_type text,
  p_activity_title text,
  p_location text,
  p_participant_choices text,
  p_support_provided text,
  p_participation_outcome text,
  p_follow_up_required text,
  p_duration_minutes integer,
  p_transport_recorded_separately boolean,
  p_pin text,
  p_declaration_confirmed boolean
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_profile public.profiles%rowtype;
  v_id uuid;
begin
  perform public.require_verified_mfa();

  select * into v_profile
  from public.profiles
  where id = auth.uid() and active;

  if v_profile.id is null or v_profile.role::text not in ('staff', 'support_worker', 'supervisor') then
    raise exception 'Active worker access is required';
  end if;
  if not public.can_access_participant(p_participant_id) then
    raise exception 'You are not assigned to this participant';
  end if;
  if not public.is_supervisor()
     and not public.worker_service_allowed(v_profile.id, 'Community and social support') then
    raise exception 'Community and social support is not included in your worker service access';
  end if;
  if p_declaration_confirmed is not true then
    raise exception 'Confirm the community support declaration';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$'
     or v_profile.medication_pin_hash is null
     or crypt(p_pin, v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'The signing PIN is incorrect';
  end if;
  if p_supported_at is null or p_supported_at > now() + interval '12 hours' then
    raise exception 'Choose a valid support date and time';
  end if;
  if p_support_type not in (
    'Doctor or health appointment',
    'Shopping and errands',
    'Cafe or meal outing',
    'Recreation and community access',
    'Op shopping',
    'Arts and crafts',
    'Other community support'
  ) then
    raise exception 'Choose a valid community support type';
  end if;
  if nullif(btrim(coalesce(p_activity_title, '')), '') is null
     or nullif(btrim(coalesce(p_participant_choices, '')), '') is null
     or nullif(btrim(coalesce(p_support_provided, '')), '') is null
     or nullif(btrim(coalesce(p_participation_outcome, '')), '') is null then
    raise exception 'Complete the activity, participant choices, support and outcome';
  end if;
  if p_duration_minutes is not null and (p_duration_minutes < 1 or p_duration_minutes > 1440) then
    raise exception 'Enter a valid support duration';
  end if;

  insert into public.community_support_records(
    organisation_id, participant_id, staff_id, supported_at, support_type,
    activity_title, location, participant_choices, support_provided,
    participation_outcome, follow_up_required, duration_minutes,
    transport_recorded_separately, status, signed_by
  ) values (
    v_profile.organisation_id, p_participant_id, v_profile.id, p_supported_at,
    p_support_type, btrim(p_activity_title),
    nullif(btrim(coalesce(p_location, '')), ''), btrim(p_participant_choices),
    btrim(p_support_provided), btrim(p_participation_outcome),
    nullif(btrim(coalesce(p_follow_up_required, '')), ''), p_duration_minutes,
    coalesce(p_transport_recorded_separately, false),
    case when nullif(btrim(coalesce(p_follow_up_required, '')), '') is null
      then 'Complete' else 'Follow-up required' end,
    v_profile.id
  ) returning id into v_id;

  insert into public.client_timeline(
    organisation_id, participant_id, event_type, severity, occurred_at,
    title, description, action_taken, follow_up, created_by
  ) values (
    v_profile.organisation_id, p_participant_id, 'Community support', 'Low',
    p_supported_at, btrim(p_activity_title),
    concat(p_support_type, ' · ', btrim(p_participant_choices)),
    btrim(p_participation_outcome),
    nullif(btrim(coalesce(p_follow_up_required, '')), ''), v_profile.id
  );

  perform public.record_access_event(
    'INSERT', 'community_support_records', v_id::text,
    jsonb_build_object(
      'participant_id', p_participant_id,
      'support_type', p_support_type,
      'signed', true
    )
  );
  return v_id;
end;
$$;

revoke all on function public.record_community_support(
  uuid, timestamptz, text, text, text, text, text, text, text, integer, boolean, text, boolean
) from public, anon;
grant execute on function public.record_community_support(
  uuid, timestamptz, text, text, text, text, text, text, text, integer, boolean, text, boolean
) to authenticated;

insert into public.worker_service_scopes(
  organisation_id, staff_id, service_type, active, granted_by
)
select p.organisation_id, p.id, 'Community and social support', true, null
from public.profiles p
where lower(p.full_name) = 'amanda buchanan'
  and p.active
on conflict (staff_id, service_type)
do update set active = true, updated_at = now();

commit;
