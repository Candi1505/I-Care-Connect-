-- FLORENCE BEDTIME MAR ROUND HOTFIX
-- Keeps the database round rules aligned with the MAR screen:
--   * includes explicitly prescribed bedtime medicines without a clock time;
--   * excludes ceased and currently held medicines; and
--   * signs only the medications still outstanding in a partly completed round.

create or replace function public.record_medication_round(
  p_participant_id uuid,
  p_round_name text,
  p_pin text,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_entry jsonb;
  v_medication public.medications%rowtype;
  v_status public.mar_status;
  v_note text;
  v_entry_id uuid;
  v_entry_ids jsonb := '[]'::jsonb;
  v_total_due_count integer;
  v_remaining_count integer;
  v_supplied_count integer;
  v_today date := (clock_timestamp() at time zone 'Australia/Brisbane')::date;
begin
  perform public.require_verified_mfa();

  if p_round_name not in ('morning', 'bedtime') then
    raise exception 'Choose the morning or bedtime medication round.';
  end if;

  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Choose an outcome for every medication in this round.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_participant_id::text || ':' || p_round_name || ':' || v_today::text, 0)
  );

  select count(*)
  into v_total_due_count
  from public.medications medication
  where medication.participant_id = p_participant_id
    and medication.active = true
    and (medication.ceased_at is null or medication.ceased_at > v_today)
    and not (
      medication.hold_from is not null
      and medication.hold_from <= v_today
      and (medication.hold_until is null or medication.hold_until >= v_today)
    )
    and regexp_replace(lower(coalesce(medication.medication_type, 'regular')), '[^a-z0-9]+', '', 'g')
        not in ('prn', 'schedule8', 's8')
    and (
      (p_round_name = 'morning' and medication.administration_time < time '12:00')
      or
      (p_round_name = 'bedtime' and (
        medication.administration_time >= time '17:00'
        or (
          medication.administration_time is null
          and coalesce(medication.instructions, '') ~* 'before( Evelyn goes to)? bed|bedtime'
        )
      ))
    );

  if v_total_due_count = 0 then
    raise exception 'There are no regular medications due in this round.';
  end if;

  select count(*)
  into v_remaining_count
  from public.medications medication
  where medication.participant_id = p_participant_id
    and medication.active = true
    and (medication.ceased_at is null or medication.ceased_at > v_today)
    and not (
      medication.hold_from is not null
      and medication.hold_from <= v_today
      and (medication.hold_until is null or medication.hold_until >= v_today)
    )
    and regexp_replace(lower(coalesce(medication.medication_type, 'regular')), '[^a-z0-9]+', '', 'g')
        not in ('prn', 'schedule8', 's8')
    and (
      (p_round_name = 'morning' and medication.administration_time < time '12:00')
      or
      (p_round_name = 'bedtime' and (
        medication.administration_time >= time '17:00'
        or (
          medication.administration_time is null
          and coalesce(medication.instructions, '') ~* 'before( Evelyn goes to)? bed|bedtime'
        )
      ))
    )
    and not exists (
      select 1
      from public.mar_entries mar_entry
      where mar_entry.medication_id = medication.id
        and mar_entry.participant_id = p_participant_id
        and (mar_entry.recorded_at at time zone 'Australia/Brisbane')::date = v_today
    );

  if v_remaining_count = 0 then
    raise exception 'This medication round has already been signed today.';
  end if;

  select count(distinct entry->>'medication_id')
  into v_supplied_count
  from jsonb_array_elements(p_entries) entry;

  if v_supplied_count <> v_remaining_count
     or jsonb_array_length(p_entries) <> v_remaining_count then
    raise exception 'Record an outcome for every medication in this round.';
  end if;

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    select *
    into v_medication
    from public.medications medication
    where medication.id = (v_entry->>'medication_id')::uuid
      and medication.participant_id = p_participant_id
      and medication.active = true
      and (medication.ceased_at is null or medication.ceased_at > v_today)
      and not (
        medication.hold_from is not null
        and medication.hold_from <= v_today
        and (medication.hold_until is null or medication.hold_until >= v_today)
      )
      and regexp_replace(lower(coalesce(medication.medication_type, 'regular')), '[^a-z0-9]+', '', 'g')
          not in ('prn', 'schedule8', 's8')
      and (
        (p_round_name = 'morning' and medication.administration_time < time '12:00')
        or
        (p_round_name = 'bedtime' and (
          medication.administration_time >= time '17:00'
          or (
            medication.administration_time is null
            and coalesce(medication.instructions, '') ~* 'before( Evelyn goes to)? bed|bedtime'
          )
        ))
      )
      and not exists (
        select 1
        from public.mar_entries mar_entry
        where mar_entry.medication_id = medication.id
          and mar_entry.participant_id = p_participant_id
          and (mar_entry.recorded_at at time zone 'Australia/Brisbane')::date = v_today
      );

    if not found then
      raise exception 'A medication in this round is unavailable, already signed, or belongs to another participant.';
    end if;

    if (v_entry->>'status') not in ('Administered', 'Withheld', 'Refused', 'Missed') then
      raise exception 'Choose a valid outcome for every medication.';
    end if;

    v_status := (v_entry->>'status')::public.mar_status;
    v_note := nullif(btrim(coalesce(v_entry->>'notes', '')), '');

    if v_status <> 'Administered'::public.mar_status and v_note is null then
      raise exception 'Add a reason for every medication not given.';
    end if;

    v_entry_id := public.record_medication_administration(
      v_medication.id,
      p_pin,
      v_status,
      v_note,
      null,
      null,
      null,
      null
    );
    v_entry_ids := v_entry_ids || to_jsonb(v_entry_id);
  end loop;

  return jsonb_build_object(
    'participant_id', p_participant_id,
    'round_name', p_round_name,
    'scheduled_date', v_today,
    'entry_ids', v_entry_ids
  );
end;
$$;

revoke execute on function public.record_medication_round(uuid, text, text, jsonb) from public;
revoke execute on function public.record_medication_round(uuid, text, text, jsonb) from anon;
grant execute on function public.record_medication_round(uuid, text, text, jsonb) to authenticated;
