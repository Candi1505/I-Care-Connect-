alter table public.medication_effect_reports
  add column if not exists effect_types text[] not null default '{}'::text[],
  add column if not exists other_effect_details text;

alter table public.medication_effect_reports
  drop constraint if exists medication_effect_reports_effect_type_check;

update public.medication_effect_reports
set effect_types = array[effect_type]
where cardinality(effect_types) = 0;

alter table public.medication_effect_reports
  drop constraint if exists medication_effect_reports_effect_types_required_check,
  drop constraint if exists medication_effect_reports_effect_types_allowed_check,
  drop constraint if exists medication_effect_reports_other_effect_details_check;

alter table public.medication_effect_reports
  add constraint medication_effect_reports_effect_types_required_check
    check (cardinality(effect_types) > 0),
  add constraint medication_effect_reports_effect_types_allowed_check
    check (effect_types <@ array[
      'Suspected side effect or adverse reaction',
      'Unexpected response',
      'Sleep change',
      'Dizziness or feeling faint',
      'Drowsiness or reduced alertness',
      'Agitation or restlessness',
      'Confusion or disorientation',
      'Balance or coordination change',
      'Nausea or vomiting',
      'Appetite or digestive change',
      'Skin reaction or swelling',
      'Breathing difficulty',
      'Mood or behaviour change',
      'Pain or headache',
      'Other medication effect'
    ]::text[]),
  add constraint medication_effect_reports_other_effect_details_check
    check (
      not ('Other medication effect' = any(effect_types))
      or nullif(btrim(coalesce(other_effect_details, '')), '') is not null
    );

create or replace function public.record_medication_effects(
  p_participant_id uuid, p_medication_id uuid, p_mar_entry_id uuid,
  p_occurred_at timestamptz, p_effect_types text[], p_other_effect_details text,
  p_participant_words text, p_observations text, p_severity text,
  p_immediate_actions text, p_supervisor_notified_at timestamptz,
  p_clinician_contacted text, p_clinical_advice text, p_monitoring_plan text,
  p_follow_up_required text, p_incident_escalation text, p_pin text,
  p_declaration_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_profile public.profiles%rowtype;
  v_medication public.medications%rowtype;
  v_id uuid;
  v_effect_types text[];
  v_effect_summary text;
  v_allowed_effects constant text[] := array[
    'Suspected side effect or adverse reaction',
    'Unexpected response',
    'Sleep change',
    'Dizziness or feeling faint',
    'Drowsiness or reduced alertness',
    'Agitation or restlessness',
    'Confusion or disorientation',
    'Balance or coordination change',
    'Nausea or vomiting',
    'Appetite or digestive change',
    'Skin reaction or swelling',
    'Breathing difficulty',
    'Mood or behaviour change',
    'Pain or headache',
    'Other medication effect'
  ]::text[];
begin
  select * into v_profile from public.profiles where id = auth.uid() and active;
  if v_profile.id is null or v_profile.role::text not in ('staff','support_worker','supervisor') then
    raise exception 'Active worker access is required';
  end if;
  if not public.can_access_participant(p_participant_id) then
    raise exception 'You are not assigned to this participant';
  end if;
  if p_declaration_confirmed is not true then
    raise exception 'Confirm the medication effect declaration';
  end if;
  if nullif(btrim(coalesce(p_observations,'')),'') is null
    or nullif(btrim(coalesce(p_immediate_actions,'')),'') is null then
    raise exception 'Record factual observations and immediate actions';
  end if;

  select coalesce(array_agg(effect order by first_position), '{}'::text[])
  into v_effect_types
  from (
    select effect, min(position) as first_position
    from unnest(coalesce(p_effect_types, '{}'::text[])) with ordinality as selected(effect, position)
    where nullif(btrim(effect), '') is not null
    group by effect
  ) deduplicated;

  if cardinality(v_effect_types) = 0 then
    raise exception 'Choose at least one medication effect';
  end if;
  if not (v_effect_types <@ v_allowed_effects) then
    raise exception 'Choose only valid medication effects';
  end if;
  if 'Other medication effect' = any(v_effect_types)
    and nullif(btrim(coalesce(p_other_effect_details,'')), '') is null then
    raise exception 'Describe the other medication effect';
  end if;
  if p_severity not in ('Low','Moderate','High','Urgent') then
    raise exception 'Choose a valid severity';
  end if;
  if p_medication_id is not null then
    select * into v_medication
    from public.medications
    where id = p_medication_id and participant_id = p_participant_id;
    if v_medication.id is null then
      raise exception 'The medication does not belong to this participant';
    end if;
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$'
    or v_profile.medication_pin_hash is null
    or crypt(p_pin,v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then
    raise exception 'The signing PIN is incorrect';
  end if;

  v_effect_summary := array_to_string(v_effect_types, ' · ');

  insert into public.medication_effect_reports(
    organisation_id, participant_id, medication_id, mar_entry_id, reported_by,
    occurred_at, effect_type, effect_types, other_effect_details,
    participant_words, observations, severity, immediate_actions,
    supervisor_notified_at, clinician_contacted, clinical_advice,
    monitoring_plan, follow_up_required, incident_escalation, signed_by
  ) values (
    v_profile.organisation_id, p_participant_id, p_medication_id, p_mar_entry_id,
    v_profile.id, p_occurred_at, v_effect_summary, v_effect_types,
    nullif(btrim(coalesce(p_other_effect_details,'')),''),
    nullif(btrim(coalesce(p_participant_words,'')),''), btrim(p_observations),
    p_severity, btrim(p_immediate_actions), p_supervisor_notified_at,
    nullif(btrim(coalesce(p_clinician_contacted,'')),''),
    nullif(btrim(coalesce(p_clinical_advice,'')),''),
    nullif(btrim(coalesce(p_monitoring_plan,'')),''),
    nullif(btrim(coalesce(p_follow_up_required,'')),''),
    nullif(btrim(coalesce(p_incident_escalation,'')),''), v_profile.id
  ) returning id into v_id;

  insert into public.client_timeline(
    organisation_id, participant_id, event_type, severity, occurred_at, title,
    description, action_taken, follow_up, created_by
  ) values (
    v_profile.organisation_id, p_participant_id, 'Medication effect', p_severity,
    p_occurred_at, coalesce(v_medication.medication_name, v_effect_summary),
    concat_ws(' · ', v_effect_summary,
      nullif(btrim(coalesce(p_other_effect_details,'')),''),
      nullif(btrim(coalesce(p_participant_words,'')),''),
      btrim(p_observations)),
    btrim(p_immediate_actions),
    concat_ws(' · ',
      nullif(btrim(coalesce(p_clinical_advice,'')),''),
      nullif(btrim(coalesce(p_monitoring_plan,'')),''),
      nullif(btrim(coalesce(p_follow_up_required,'')),''),
      nullif(btrim(coalesce(p_incident_escalation,'')),'')),
    v_profile.id
  );

  insert into public.notifications(
    organisation_id, recipient_id, title, body, category, related_record_id, created_at
  )
  select v_profile.organisation_id, p.id, 'Medication effect requires review',
    coalesce(v_medication.medication_name,'A medication effect') ||
      ' was reported for ' ||
      coalesce(
        (select preferred_name from public.participants where id=p_participant_id),
        (select full_name from public.participants where id=p_participant_id),
        'a participant'
      ) || '.',
    'Medication effect', v_id, now()
  from public.profiles p
  where p.organisation_id=v_profile.organisation_id
    and p.active
    and p.role::text='supervisor';

  perform public.record_access_event(
    'INSERT', 'medication_effect_reports', v_id::text,
    jsonb_build_object(
      'participant_id', p_participant_id,
      'medication_id', p_medication_id,
      'effect_types', v_effect_types,
      'severity', p_severity,
      'signed', true
    )
  );
  return v_id;
end;
$function$;

revoke all on function public.record_medication_effects(
  uuid,uuid,uuid,timestamptz,text[],text,text,text,text,text,timestamptz,
  text,text,text,text,text,text,boolean
) from public, anon;
grant execute on function public.record_medication_effects(
  uuid,uuid,uuid,timestamptz,text[],text,text,text,text,text,timestamptz,
  text,text,text,text,text,text,boolean
) to authenticated, service_role;

create or replace function public.record_medication_effect(
  p_participant_id uuid, p_medication_id uuid, p_mar_entry_id uuid,
  p_occurred_at timestamptz, p_effect_type text, p_participant_words text,
  p_observations text, p_severity text, p_immediate_actions text,
  p_supervisor_notified_at timestamptz, p_clinician_contacted text,
  p_clinical_advice text, p_monitoring_plan text, p_follow_up_required text,
  p_incident_escalation text, p_pin text, p_declaration_confirmed boolean
)
returns uuid
language sql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  select public.record_medication_effects(
    p_participant_id, p_medication_id, p_mar_entry_id, p_occurred_at,
    array[p_effect_type], null, p_participant_words, p_observations, p_severity,
    p_immediate_actions, p_supervisor_notified_at, p_clinician_contacted,
    p_clinical_advice, p_monitoring_plan, p_follow_up_required,
    p_incident_escalation, p_pin, p_declaration_confirmed
  );
$function$;

revoke all on function public.record_medication_effect(
  uuid,uuid,uuid,timestamptz,text,text,text,text,text,timestamptz,
  text,text,text,text,text,text,boolean
) from public, anon;
grant execute on function public.record_medication_effect(
  uuid,uuid,uuid,timestamptz,text,text,text,text,text,timestamptz,
  text,text,text,text,text,text,boolean
) to authenticated, service_role;
