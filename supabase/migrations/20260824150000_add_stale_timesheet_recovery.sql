begin;

alter table public.timesheets
  drop constraint if exists timesheets_clock_out_after_clock_in;
alter table public.timesheets
  add constraint timesheets_clock_out_after_clock_in
  check (clock_out is null or clock_out > clock_in) not valid;
alter table public.timesheets
  validate constraint timesheets_clock_out_after_clock_in;

create or replace function public.supervisor_resolve_open_timesheet(
  p_timesheet_id uuid,
  p_clock_out timestamptz,
  p_break_minutes integer,
  p_reason text,
  p_pin text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_timesheet public.timesheets%rowtype;
  v_break integer;
  v_reason text;
begin
  perform public.require_verified_mfa();

  select * into v_profile
  from public.profiles
  where id = auth.uid()
    and active = true
    and role = 'supervisor';

  if v_profile.id is null then
    raise exception 'Only an active supervisor can resolve an old clock-in';
  end if;

  if p_pin is null
     or p_pin !~ '^[0-9]{6}$'
     or v_profile.medication_pin_hash is null
     or crypt(p_pin, v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'The signing PIN is incorrect';
  end if;

  v_break := greatest(coalesce(p_break_minutes, 0), 0);
  if v_break > 1440 then
    raise exception 'Unpaid break minutes are not valid';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null or length(v_reason) < 10 then
    raise exception 'Record a clear correction reason of at least 10 characters';
  end if;
  if length(v_reason) > 1000 then
    raise exception 'The correction reason is too long';
  end if;

  select * into v_timesheet
  from public.timesheets
  where id = p_timesheet_id
    and organisation_id = v_profile.organisation_id
    and clock_out is null
  for update;

  if v_timesheet.id is null then
    raise exception 'The open timesheet was not found or has already been resolved';
  end if;
  if v_timesheet.clock_in > clock_timestamp() - interval '18 hours' then
    raise exception 'This clock-in is still current and cannot be changed with the old clock-in recovery tool';
  end if;
  if p_clock_out is null or p_clock_out <= v_timesheet.clock_in then
    raise exception 'The actual clock-out must be after the clock-in';
  end if;
  if p_clock_out > clock_timestamp() + interval '5 minutes' then
    raise exception 'The actual clock-out cannot be in the future';
  end if;
  if p_clock_out > v_timesheet.clock_in + interval '36 hours' then
    raise exception 'The corrected work period cannot exceed 36 hours; check the date and time';
  end if;
  if v_break >= floor(extract(epoch from (p_clock_out - v_timesheet.clock_in)) / 60) then
    raise exception 'Break minutes must be shorter than the work period';
  end if;

  update public.timesheets
  set clock_out = p_clock_out,
      break_minutes = v_break,
      clock_out_notes = concat_ws(
        E'\n',
        nullif(btrim(coalesce(clock_out_notes, '')), ''),
        'Supervisor correction: ' || v_reason
      ),
      notes = concat_ws(
        E'\n',
        nullif(btrim(coalesce(notes, '')), ''),
        'Supervisor correction: ' || v_reason
      ),
      status = 'Submitted',
      approved_by = null,
      approved_at = null,
      updated_at = now()
  where id = v_timesheet.id;

  insert into public.audit_events (
    organisation_id, actor_id, table_name, record_id, action,
    before_data, after_data
  ) values (
    v_profile.organisation_id, v_profile.id, 'timesheets',
    v_timesheet.id::text, 'UPDATE',
    jsonb_build_object(
      'clock_in', v_timesheet.clock_in,
      'clock_out', v_timesheet.clock_out,
      'break_minutes', v_timesheet.break_minutes,
      'status', v_timesheet.status
    ),
    jsonb_build_object(
      'event', 'supervisor_stale_clock_in_resolved',
      'clock_in', v_timesheet.clock_in,
      'clock_out', p_clock_out,
      'break_minutes', v_break,
      'reason', v_reason,
      'worker_id', v_timesheet.staff_id,
      'pin_verified', true
    )
  );

  return v_timesheet.id;
end;
$$;

revoke all on function public.supervisor_resolve_open_timesheet(uuid,timestamptz,integer,text,text)
  from public, anon;
grant execute on function public.supervisor_resolve_open_timesheet(uuid,timestamptz,integer,text,text)
  to authenticated;

notify pgrst, 'reload schema';

commit;
