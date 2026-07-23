-- FLORENCE MAR ROUND PIN-SIGNATURE UPGRADE
-- Non-destructive: preserves all existing Florence data.
-- Run once in Supabase SQL Editor.

create or replace function public.record_medication_administration(
  p_medication_id uuid,
  p_pin text,
  p_status public.mar_status default 'Administered',
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_medication public.medications;
  v_entry_id uuid;
begin
  select *
  into v_profile
  from public.profiles
  where id = auth.uid()
    and active = true;

  if v_profile.id is null then
    raise exception 'Florence profile is not active';
  end if;

  if v_profile.role not in ('supervisor','staff') then
    raise exception 'Only staff can record medication administration';
  end if;

  if v_profile.medication_pin_hash is null
     or crypt(p_pin, v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'Incorrect medication PIN';
  end if;

  select *
  into v_medication
  from public.medications
  where id = p_medication_id
    and organisation_id = v_profile.organisation_id
    and active = true;

  if v_medication.id is null then
    raise exception 'Medication is not available';
  end if;

  insert into public.mar_entries (
    organisation_id,
    medication_id,
    participant_id,
    staff_id,
    status,
    pin_verified,
    notes
  )
  values (
    v_profile.organisation_id,
    v_medication.id,
    v_medication.participant_id,
    v_profile.id,
    p_status,
    true,
    p_notes
  )
  returning id into v_entry_id;

  return v_entry_id;
end;
$$;

grant execute on function public.record_medication_administration(
  uuid,
  text,
  public.mar_status,
  text
) to authenticated;
