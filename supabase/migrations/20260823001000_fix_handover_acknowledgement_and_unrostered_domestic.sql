-- Repair the daily handover acknowledgement audit action and allow a supervisor
-- to sign a factual domestic-duty checklist when no roster shift exists.

alter table public.audit_events
  drop constraint if exists audit_events_action_check;

alter table public.audit_events
  add constraint audit_events_action_check
  check (action in (
    'INSERT', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'EXPORT',
    'LOGIN', 'MFA_ENROLLED', 'ACKNOWLEDGE'
  ));

create or replace function public.record_access_event(
  p_action text,
  p_table_name text,
  p_record_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id bigint;
  v_profile public.profiles%rowtype;
begin
  perform public.require_verified_mfa();
  if p_action not in (
    'INSERT', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'EXPORT',
    'LOGIN', 'MFA_ENROLLED', 'ACKNOWLEDGE'
  ) then
    raise exception 'Unsupported audit action';
  end if;
  if nullif(btrim(coalesce(p_table_name, '')), '') is null then
    raise exception 'Audit table name is required';
  end if;
  if octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 16384 then
    raise exception 'Audit metadata is too large';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and active = true;
  if v_profile.id is null then
    raise exception 'Active Florence profile required';
  end if;

  insert into public.audit_events(
    organisation_id, actor_id, table_name, record_id, action, after_data
  ) values (
    v_profile.organisation_id,
    v_profile.id,
    left(btrim(p_table_name), 80),
    p_record_id,
    p_action,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.record_access_event(text,text,text,jsonb) from public, anon;
grant execute on function public.record_access_event(text,text,text,jsonb) to authenticated;

create or replace function public.record_domestic_checklist(
  p_participant_id uuid,
  p_shift_id uuid,
  p_shift_date date,
  p_tasks jsonb,
  p_participant_preferences text,
  p_not_completed_reason text,
  p_follow_up_required text,
  p_pin text,
  p_declaration_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $function$
declare
  v_profile public.profiles%rowtype;
  v_shift public.shifts%rowtype;
  v_id uuid;
  v_linked_shift_id uuid;
  v_no_shift_id constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  perform public.require_verified_mfa();

  select * into v_profile
  from public.profiles
  where id = auth.uid() and active;

  if v_profile.id is null or v_profile.role::text not in ('staff','support_worker','supervisor') then
    raise exception 'Only active workers can sign domestic duties checklists';
  end if;
  if not public.worker_service_allowed(v_profile.id, 'Domestic assistance') then
    raise exception 'Domestic assistance is not included in your worker service access';
  end if;
  if not public.can_access_participant(p_participant_id) then
    raise exception 'You are not authorised for this participant';
  end if;
  if p_declaration_confirmed is not true then
    raise exception 'Confirm the signed declaration';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$'
     or v_profile.medication_pin_hash is null
     or crypt(p_pin, v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'Incorrect six-digit signing PIN';
  end if;
  if p_shift_date is null then
    raise exception 'Choose the date the domestic duties were completed';
  end if;
  if p_shift_date > (now() at time zone 'Australia/Brisbane')::date then
    raise exception 'The domestic duties date cannot be in the future';
  end if;
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'object' or p_tasks = '{}'::jsonb then
    raise exception 'Tick at least one duty you completed';
  end if;

  if p_shift_id is null or p_shift_id = v_no_shift_id then
    if not public.is_supervisor() then
      raise exception 'Choose an accepted domestic-assistance shift. A supervisor can record verified unrostered duties.';
    end if;
    v_linked_shift_id := null;
  else
    select * into v_shift
    from public.shifts
    where id = p_shift_id
      and organisation_id = v_profile.organisation_id
      and participant_id = p_participant_id
      and (assigned_staff_id = v_profile.id or public.is_supervisor())
      and status::text = 'Published'
      and response::text = 'Accepted'
      and shift_type ilike '%domestic%';

    if v_shift.id is null then
      raise exception 'Choose an accepted domestic-assistance shift';
    end if;
    if p_shift_date < (v_shift.starts_at at time zone 'Australia/Brisbane')::date
       or p_shift_date > (v_shift.ends_at at time zone 'Australia/Brisbane')::date then
      raise exception 'The checklist date must fall within the accepted shift';
    end if;
    v_linked_shift_id := v_shift.id;
  end if;

  insert into public.domestic_duty_records(
    organisation_id, participant_id, staff_id, shift_id, shift_date, tasks,
    participant_preferences, not_completed_reason, follow_up_required,
    signed_by, signed_at, status
  ) values (
    v_profile.organisation_id,
    p_participant_id,
    v_profile.id,
    v_linked_shift_id,
    p_shift_date,
    p_tasks,
    nullif(btrim(coalesce(p_participant_preferences,'')),''),
    nullif(btrim(coalesce(p_not_completed_reason,'')),''),
    nullif(btrim(coalesce(p_follow_up_required,'')),''),
    v_profile.id,
    now(),
    case
      when nullif(btrim(coalesce(p_follow_up_required,'')),'') is null then 'Complete'
      else 'Follow-up required'
    end
  ) returning id into v_id;

  perform public.record_access_event(
    'INSERT',
    'domestic_duty_records',
    v_id::text,
    jsonb_build_object(
      'participant_id', p_participant_id,
      'shift_id', v_linked_shift_id,
      'unrostered_supervisor_record', v_linked_shift_id is null
    )
  );

  return v_id;
end;
$function$;

revoke all on function public.record_domestic_checklist(uuid,uuid,date,jsonb,text,text,text,text,boolean) from public, anon;
grant execute on function public.record_domestic_checklist(uuid,uuid,date,jsonb,text,text,text,text,boolean) to authenticated;

comment on function public.record_domestic_checklist(uuid,uuid,date,jsonb,text,text,text,text,boolean)
is 'Creates a PIN-signed domestic duties checklist. Workers use an accepted domestic shift; supervisors may record verified duties when no roster shift exists.';

notify pgrst, 'reload schema';
