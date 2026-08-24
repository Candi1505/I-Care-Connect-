\set ON_ERROR_STOP on

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',
  true
);

select public.set_my_signing_pin('135790');

do $smoke$
declare
  v_record_id uuid;
  v_wrong_pin_denied boolean := false;
  v_supervision_breach_denied boolean := false;
begin
  if has_function_privilege('anon', 'public.record_vehicle_refusal(uuid,text,timestamptz,text,text,text,text[],text,text,text,text,text[],text,text,boolean,text,text,text,text,text,text[],text[],text,text,boolean)', 'execute') then
    raise exception 'Anonymous users can execute the vehicle refusal record function';
  end if;
  if not has_function_privilege('authenticated', 'public.record_vehicle_refusal(uuid,text,timestamptz,text,text,text,text[],text,text,text,text,text[],text,text,boolean,text,text,text,text,text,text[],text[],text,text,boolean)', 'execute') then
    raise exception 'Authenticated workers cannot reach the vehicle refusal record function';
  end if;

  begin
    perform public.record_vehicle_refusal(
      '10000000-0000-0000-0000-000000000002', 'sil', now(),
      'Shopping or errands', 'Weekly groceries', 'Safe car park',
      array['Words'], 'Evelyn said no and remained seated.',
      'What would you like to do?', 'Not stated',
      'The planned shopping and genuine alternatives were explained without pressure.',
      array['Pause and wait','End outing or return home'],
      'Evelyn chose to return home.',
      'Worker remained beside Evelyn in a safely parked and ventilated vehicle.',
      true, null, null, null, null,
      'Returned home together safely.', array['None'], array['Shift note'],
      'Supervisor to review at next team meeting.', '000000', true
    );
  exception when others then
    if sqlerrm = 'The signing PIN is incorrect' then
      v_wrong_pin_denied := true;
    else
      raise;
    end if;
  end;
  if not v_wrong_pin_denied then
    raise exception 'An incorrect signing PIN was not denied';
  end if;

  begin
    perform public.record_vehicle_refusal(
      '10000000-0000-0000-0000-000000000002', 'community', now(),
      'Appointment', 'Health appointment', 'Clinic car park',
      array['Words'], 'Evelyn said she would stay in the car.',
      'What would you prefer?', 'Evelyn wanted to remain seated.',
      'The appointment and alternative arrangements were explained neutrally.',
      array['Pause and wait','Return later or reschedule'],
      'Evelyn chose to wait.',
      'Worker incorrectly left the vehicle.',
      false, 'Victoria Kussrow', 'Immediate management notification.', null, null,
      'Worker returned to the vehicle.', array['None'], array['Shift note'],
      'Management review required.', '135790', true
    );
  exception when others then
    if sqlerrm = 'An incident report is required when the participant was left unattended' then
      v_supervision_breach_denied := true;
    else
      raise;
    end if;
  end;
  if not v_supervision_breach_denied then
    raise exception 'A supervision breach was accepted without an incident report';
  end if;

  select public.record_vehicle_refusal(
    '10000000-0000-0000-0000-000000000002', 'community', now(),
    'Social or recreation', 'Community art group', 'Community centre car park',
    array['Words','Gesture or body language'],
    'Evelyn said no, shook her head and remained seated.',
    'What would you like to do instead?', 'Evelyn wanted to go home.',
    'The activity, timing and alternatives were explained in clear neutral language.',
    array['Pause and wait','Modify the activity','End outing or return home'],
    'Evelyn chose to return home.',
    'Worker stayed with Evelyn, parked safely, monitored temperature and provided reassurance.',
    true, null, null, null, null,
    'Evelyn and the worker returned home together safely.',
    array['None'], array['Shift note'],
    'Record the preference in the next handover.', '135790', true
  ) into v_record_id;

  if not exists (
    select 1
    from public.sil_records
    where id = v_record_id
      and participant_id = '10000000-0000-0000-0000-000000000002'
      and staff_id = auth.uid()
      and record_type = 'vehicleRefusal'
      and category = 'Supported decision-making'
      and status = 'Complete'
      and fields->>'service_context' = 'community'
      and fields->>'worker_remained_with_participant' = 'true'
      and fields->>'pin_verified' = 'true'
      and fields->'options_offered' ? 'End outing or return home'
  ) then
    raise exception 'The PIN-signed vehicle refusal record was not stored correctly';
  end if;

  if not exists (
    select 1 from public.client_timeline
    where related_sil_record_id = v_record_id
      and event_type = 'Other'
      and severity = 'Low'
  ) then
    raise exception 'The vehicle refusal record was not linked to the participant timeline';
  end if;
end;
$smoke$;

rollback;

select 'VEHICLE_REFUSAL_SUPPORT_SMOKE_PASS' as result;
