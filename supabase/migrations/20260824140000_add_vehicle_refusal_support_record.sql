begin;

alter table public.sil_records
  drop constraint if exists sil_records_type_check;

alter table public.sil_records
  add constraint sil_records_type_check
  check (record_type = any (array[
    'house'::text,
    'safeguarding'::text,
    'meeting'::text,
    'houseRules'::text,
    'visitor'::text,
    'supportPlan'::text,
    'emergencyPlan'::text,
    'riskAssessment'::text,
    'intake'::text,
    'communication'::text,
    'instructions'::text,
    'choice'::text,
    'agreementExplanation'::text,
    'serviceAgreement'::text,
    'rights'::text,
    'privateSpace'::text,
    'handover'::text,
    'induction'::text,
    'competency'::text,
    'training'::text,
    'observation'::text,
    'domesticChecklist'::text,
    'vehicleRefusal'::text
  ]));

create or replace function public.validate_sil_record()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $validator$
declare
  v_creator_org uuid;
  v_participant_org uuid;
  v_staff_org uuid;
  v_role text;
  v_review_date date;
  v_record_date date;
  participant_types constant text[] := array[
    'visitor','supportPlan','emergencyPlan','riskAssessment','intake','communication','instructions',
    'choice','agreementExplanation','serviceAgreement','rights','privateSpace','handover',
    'domesticChecklist','vehicleRefusal'
  ];
  worker_types constant text[] := array['induction','competency','training','observation'];
  annual_review_types constant text[] := array['supportPlan','emergencyPlan','riskAssessment','communication','instructions'];
begin
  select organisation_id, role::text
  into v_creator_org, v_role
  from public.profiles
  where id = new.created_by and active = true;

  if v_creator_org is null or v_creator_org <> new.organisation_id then
    raise exception 'The SIL record creator must be active in this organisation';
  end if;
  if tg_op = 'INSERT' and auth.uid() is not null and new.created_by <> auth.uid() then
    raise exception 'SIL records must be signed by the person creating them';
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.record_type = any(participant_types) and new.participant_id is null then
    raise exception 'This SIL record must be linked to a participant';
  end if;
  if new.record_type = any(worker_types) and new.staff_id is null then
    raise exception 'This SIL record must be linked to a worker';
  end if;
  if new.participant_id is not null then
    select organisation_id into v_participant_org
    from public.participants where id = new.participant_id;
    if v_participant_org is null or v_participant_org <> new.organisation_id then
      raise exception 'The SIL participant is not in this organisation';
    end if;
  end if;
  if new.staff_id is not null then
    select organisation_id into v_staff_org
    from public.profiles where id = new.staff_id and active = true;
    if v_staff_org is null or v_staff_org <> new.organisation_id then
      raise exception 'The SIL worker is not active in this organisation';
    end if;
  end if;
  if jsonb_typeof(new.fields) <> 'object' or octet_length(new.fields::text) > 262144 then
    raise exception 'The SIL record fields are invalid or too large';
  end if;
  if new.record_type = any(annual_review_types) then
    begin
      v_review_date := (new.fields->>'review_date')::date;
      v_record_date := coalesce(
        nullif(new.fields->>'plan_date','')::date,
        nullif(new.fields->>'assessment_date','')::date,
        nullif(new.fields->>'profile_date','')::date,
        nullif(new.fields->>'effective_date','')::date,
        current_date
      );
    exception when others then
      raise exception 'This SIL record requires valid record and review dates';
    end;
    if v_review_date is null or v_review_date < v_record_date or v_review_date > v_record_date + 366 then
      raise exception 'The SIL review date must be on or after the record date and no later than 12 months';
    end if;
  end if;
  if new.record_type = 'choice' and coalesce(new.fields->>'declaration','') <> 'Yes' then
    raise exception 'The worker declaration is required for a participant choice record';
  end if;
  if auth.uid() is not null and v_role = 'staff' then
    if new.record_type not in ('visitor','choice','handover','domesticChecklist','vehicleRefusal') then
      raise exception 'This SIL record type must be completed by a supervisor';
    end if;
    if new.participant_id is null or not public.can_access_participant(new.participant_id) then
      raise exception 'You are not authorised for this participant';
    end if;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  new.updated_at := now();
  return new;
end;
$validator$;

create or replace function public.record_vehicle_refusal(
  p_participant_id uuid,
  p_service_context text,
  p_occurred_at timestamptz,
  p_destination_type text,
  p_planned_destination text,
  p_location text,
  p_choice_communication text[],
  p_participant_words text,
  p_open_question text,
  p_reason_stated text,
  p_information_explained text,
  p_options_offered text[],
  p_participant_decision text,
  p_immediate_safety_controls text,
  p_worker_remained_with_participant boolean,
  p_management_contact text,
  p_management_direction text,
  p_service_clinician_contact text,
  p_advice_received text,
  p_outcome text,
  p_health_medication_impacts text[],
  p_records_required text[],
  p_follow_up_required text,
  p_pin text,
  p_declaration_confirmed boolean
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_profile public.profiles%rowtype;
  v_record_id uuid;
  v_title text;
  v_status text;
  v_timeline_severity public.timeline_severity;
  v_required_service text;
  v_fields jsonb;
begin
  perform public.require_verified_mfa();

  select * into v_profile
  from public.profiles
  where id = auth.uid() and active;

  if v_profile.id is null or v_profile.role::text not in ('staff', 'support_worker', 'supervisor') then
    raise exception 'Active worker access is required';
  end if;
  if p_participant_id is null or not public.can_access_participant(p_participant_id) then
    raise exception 'You are not assigned to this participant';
  end if;
  if p_service_context not in ('sil', 'community') then
    raise exception 'Choose SIL or community support';
  end if;

  v_required_service := case p_service_context
    when 'sil' then 'Supported Independent Living'
    else 'Community and social support'
  end;
  if not public.is_supervisor()
     and not public.worker_service_allowed(v_profile.id, v_required_service) then
    raise exception 'This service is not included in your worker access';
  end if;

  if p_declaration_confirmed is not true then
    raise exception 'Confirm the vehicle refusal record declaration';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$'
     or v_profile.medication_pin_hash is null
     or crypt(p_pin, v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'The signing PIN is incorrect';
  end if;
  if p_occurred_at is null or p_occurred_at > now() + interval '12 hours' then
    raise exception 'Choose a valid date and time';
  end if;
  if p_destination_type not in (
    'Shopping or errands',
    'Appointment',
    'Social or recreation',
    'Meal or cafe',
    'Returning home',
    'Medication or pharmacy',
    'Immediate emergency',
    'Other'
  ) then
    raise exception 'Choose a valid destination or activity type';
  end if;
  if nullif(btrim(coalesce(p_planned_destination, '')), '') is null
     or nullif(btrim(coalesce(p_participant_words, '')), '') is null
     or nullif(btrim(coalesce(p_information_explained, '')), '') is null
     or nullif(btrim(coalesce(p_participant_decision, '')), '') is null
     or nullif(btrim(coalesce(p_immediate_safety_controls, '')), '') is null
     or nullif(btrim(coalesce(p_outcome, '')), '') is null then
    raise exception 'Complete the destination, communication, information, decision, safety controls and outcome';
  end if;
  if coalesce(cardinality(p_choice_communication), 0) = 0 then
    raise exception 'Record how the participant communicated their choice';
  end if;
  if coalesce(cardinality(p_options_offered), 0) = 0 then
    raise exception 'Record at least one genuine option offered';
  end if;
  if 'None' = any(coalesce(p_health_medication_impacts, array[]::text[]))
     and cardinality(coalesce(p_health_medication_impacts, array[]::text[])) > 1 then
    raise exception 'Choose None or the health and medication impacts, not both';
  end if;
  if p_worker_remained_with_participant is not true then
    if p_management_contact not in ('Victoria Kussrow', 'Candice Long') then
      raise exception 'Contact Victoria or Candice immediately when continuous supervision was not maintained';
    end if;
    if not ('Incident report' = any(coalesce(p_records_required, array[]::text[]))) then
      raise exception 'An incident report is required when the participant was left unattended';
    end if;
  end if;

  v_status := case
    when p_worker_remained_with_participant is not true
      or 'Incident report' = any(coalesce(p_records_required, array[]::text[]))
      or 'Emergency response' = any(coalesce(p_records_required, array[]::text[]))
    then 'Needs confirmation'
    else 'Complete'
  end;
  v_timeline_severity := case
    when v_status = 'Needs confirmation'
      or exists (
        select 1
        from unnest(coalesce(p_health_medication_impacts, array[]::text[])) as impact
        where impact <> 'None'
      )
    then 'Moderate'::public.timeline_severity
    else 'Low'::public.timeline_severity
  end;
  v_title := concat('Vehicle refusal · ', p_destination_type);
  v_fields := jsonb_build_object(
    'service_context', p_service_context,
    'occurred_at', p_occurred_at,
    'destination_type', p_destination_type,
    'planned_destination', btrim(p_planned_destination),
    'location', nullif(btrim(coalesce(p_location, '')), ''),
    'choice_communication', to_jsonb(coalesce(p_choice_communication, array[]::text[])),
    'participant_words_or_behaviour', btrim(p_participant_words),
    'open_question_asked', nullif(btrim(coalesce(p_open_question, '')), ''),
    'reason_stated', coalesce(nullif(btrim(coalesce(p_reason_stated, '')), ''), 'Not stated'),
    'information_explained', btrim(p_information_explained),
    'options_offered', to_jsonb(coalesce(p_options_offered, array[]::text[])),
    'participant_decision', btrim(p_participant_decision),
    'immediate_safety_controls', btrim(p_immediate_safety_controls),
    'worker_remained_with_participant', coalesce(p_worker_remained_with_participant, false),
    'management_contact', nullif(btrim(coalesce(p_management_contact, '')), ''),
    'management_direction', nullif(btrim(coalesce(p_management_direction, '')), ''),
    'service_or_clinician_contact', nullif(btrim(coalesce(p_service_clinician_contact, '')), ''),
    'advice_received', nullif(btrim(coalesce(p_advice_received, '')), ''),
    'outcome', btrim(p_outcome),
    'health_medication_impacts', to_jsonb(coalesce(p_health_medication_impacts, array[]::text[])),
    'records_required', to_jsonb(coalesce(p_records_required, array[]::text[])),
    'follow_up_required', nullif(btrim(coalesce(p_follow_up_required, '')), ''),
    'pin_verified', true,
    'signed_by', v_profile.full_name,
    'signed_at', now()
  );

  insert into public.sil_records(
    organisation_id, participant_id, staff_id, record_type, category,
    title, fields, status, created_by, updated_by
  ) values (
    v_profile.organisation_id, p_participant_id, v_profile.id,
    'vehicleRefusal', 'Supported decision-making', v_title, v_fields,
    v_status, v_profile.id, v_profile.id
  ) returning id into v_record_id;

  insert into public.client_timeline(
    organisation_id, participant_id, event_type, severity, occurred_at,
    title, description, action_taken, follow_up, created_by,
    related_sil_record_id
  ) values (
    v_profile.organisation_id,
    p_participant_id,
    'Other'::public.timeline_event_type,
    v_timeline_severity,
    p_occurred_at,
    v_title,
    concat(
      btrim(p_planned_destination),
      ' · Choice communicated: ',
      btrim(p_participant_words),
      ' · Decision: ',
      btrim(p_participant_decision)
    ),
    btrim(p_outcome),
    nullif(btrim(coalesce(p_follow_up_required, '')), ''),
    v_profile.id,
    v_record_id
  );

  perform public.record_access_event(
    'INSERT',
    'sil_records',
    v_record_id::text,
    jsonb_build_object(
      'participant_id', p_participant_id,
      'record_type', 'vehicleRefusal',
      'service_context', p_service_context,
      'continuous_supervision', coalesce(p_worker_remained_with_participant, false),
      'signed', true
    )
  );

  return v_record_id;
end;
$$;

revoke all on function public.record_vehicle_refusal(
  uuid, text, timestamptz, text, text, text, text[], text, text, text,
  text, text[], text, text, boolean, text, text, text, text, text,
  text[], text[], text, text, boolean
) from public, anon;

grant execute on function public.record_vehicle_refusal(
  uuid, text, timestamptz, text, text, text, text[], text, text, text,
  text, text[], text, text, boolean, text, text, text, text, text,
  text[], text[], text, text, boolean
) to authenticated;

commit;
