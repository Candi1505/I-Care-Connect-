create table if not exists public.medication_effect_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  participant_id uuid not null references public.participants(id),
  medication_id uuid references public.medications(id),
  mar_entry_id uuid references public.mar_entries(id),
  reported_by uuid not null references public.profiles(id),
  occurred_at timestamptz not null,
  effect_type text not null check (effect_type in ('Suspected side effect or adverse reaction','Unexpected response','Sleep change','Dizziness, drowsiness or reduced alertness','Agitation or restlessness','Other medication effect')),
  participant_words text,
  observations text not null,
  severity text not null check (severity in ('Low','Moderate','High','Urgent')),
  immediate_actions text not null,
  supervisor_notified_at timestamptz,
  clinician_contacted text,
  clinical_advice text,
  monitoring_plan text,
  follow_up_required text,
  incident_escalation text,
  status text not null default 'Open' check (status in ('Open','Under review','Closed')),
  signed_by uuid not null references public.profiles(id),
  signed_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  outcome text,
  created_at timestamptz not null default now()
);

alter table public.medication_effect_reports enable row level security;

drop policy if exists medication_effect_reports_select on public.medication_effect_reports;
create policy medication_effect_reports_select on public.medication_effect_reports
for select to authenticated
using (
  organisation_id = public.current_org_id()
  and (public.is_supervisor() or (reported_by = auth.uid() and public.can_access_participant(participant_id)))
);

revoke all on table public.medication_effect_reports from anon, authenticated;
grant select on table public.medication_effect_reports to authenticated;
grant all on table public.medication_effect_reports to service_role;

create or replace function public.record_medication_effect(
  p_participant_id uuid, p_medication_id uuid, p_mar_entry_id uuid,
  p_occurred_at timestamptz, p_effect_type text, p_participant_words text,
  p_observations text, p_severity text, p_immediate_actions text,
  p_supervisor_notified_at timestamptz, p_clinician_contacted text,
  p_clinical_advice text, p_monitoring_plan text, p_follow_up_required text,
  p_incident_escalation text, p_pin text, p_declaration_confirmed boolean
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
begin
  select * into v_profile from public.profiles where id = auth.uid() and active;
  if v_profile.id is null or v_profile.role::text not in ('staff','support_worker','supervisor') then raise exception 'Active worker access is required'; end if;
  if not public.can_access_participant(p_participant_id) then raise exception 'You are not assigned to this participant'; end if;
  if p_declaration_confirmed is not true then raise exception 'Confirm the medication effect declaration'; end if;
  if nullif(btrim(coalesce(p_observations,'')),'') is null or nullif(btrim(coalesce(p_immediate_actions,'')),'') is null then raise exception 'Record factual observations and immediate actions'; end if;
  if p_effect_type not in ('Suspected side effect or adverse reaction','Unexpected response','Sleep change','Dizziness, drowsiness or reduced alertness','Agitation or restlessness','Other medication effect') then raise exception 'Choose a valid medication effect'; end if;
  if p_severity not in ('Low','Moderate','High','Urgent') then raise exception 'Choose a valid severity'; end if;
  if p_medication_id is not null then
    select * into v_medication from public.medications where id = p_medication_id and participant_id = p_participant_id;
    if v_medication.id is null then raise exception 'The medication does not belong to this participant'; end if;
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' or v_profile.medication_pin_hash is null or crypt(p_pin,v_profile.medication_pin_hash) <> v_profile.medication_pin_hash then raise exception 'The signing PIN is incorrect'; end if;

  insert into public.medication_effect_reports(
    organisation_id,participant_id,medication_id,mar_entry_id,reported_by,occurred_at,effect_type,participant_words,observations,severity,immediate_actions,supervisor_notified_at,clinician_contacted,clinical_advice,monitoring_plan,follow_up_required,incident_escalation,signed_by
  ) values (
    v_profile.organisation_id,p_participant_id,p_medication_id,p_mar_entry_id,v_profile.id,p_occurred_at,p_effect_type,
    nullif(btrim(coalesce(p_participant_words,'')),''),btrim(p_observations),p_severity,btrim(p_immediate_actions),p_supervisor_notified_at,
    nullif(btrim(coalesce(p_clinician_contacted,'')),''),nullif(btrim(coalesce(p_clinical_advice,'')),''),nullif(btrim(coalesce(p_monitoring_plan,'')),''),nullif(btrim(coalesce(p_follow_up_required,'')),''),nullif(btrim(coalesce(p_incident_escalation,'')),''),v_profile.id
  ) returning id into v_id;

  insert into public.client_timeline(organisation_id,participant_id,event_type,severity,occurred_at,title,description,action_taken,follow_up,created_by)
  values (
    v_profile.organisation_id,p_participant_id,'Medication effect',p_severity,p_occurred_at,coalesce(v_medication.medication_name,p_effect_type),
    concat_ws(' · ',p_effect_type,nullif(btrim(coalesce(p_participant_words,'')),''),btrim(p_observations)),btrim(p_immediate_actions),
    concat_ws(' · ',nullif(btrim(coalesce(p_clinical_advice,'')),''),nullif(btrim(coalesce(p_monitoring_plan,'')),''),nullif(btrim(coalesce(p_follow_up_required,'')),''),nullif(btrim(coalesce(p_incident_escalation,'')),'')),v_profile.id
  );

  insert into public.notifications(organisation_id,recipient_id,title,body,category,related_record_id,created_at)
  select v_profile.organisation_id,p.id,'Medication effect requires review',coalesce(v_medication.medication_name,'A medication effect') || ' was reported for ' || coalesce((select preferred_name from public.participants where id=p_participant_id),(select full_name from public.participants where id=p_participant_id),'a participant') || '.','Medication effect',v_id,now()
  from public.profiles p where p.organisation_id=v_profile.organisation_id and p.active and p.role::text='supervisor';

  perform public.record_access_event('INSERT','medication_effect_reports',v_id::text,jsonb_build_object('participant_id',p_participant_id,'medication_id',p_medication_id,'severity',p_severity,'signed',true));
  return v_id;
end;
$function$;

revoke all on function public.record_medication_effect(uuid,uuid,uuid,timestamptz,text,text,text,text,text,timestamptz,text,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.record_medication_effect(uuid,uuid,uuid,timestamptz,text,text,text,text,text,timestamptz,text,text,text,text,text,text,boolean) to authenticated, service_role;
