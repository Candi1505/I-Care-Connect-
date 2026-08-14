-- Florence domestic duties tick-and-flick checklist.
-- PIN-signed, participant-scoped and linked to the worker's accepted shift.

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
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
 v_profile public.profiles%rowtype;
 v_participant public.participants%rowtype;
 v_shift public.shifts%rowtype;
 v_record_id uuid;
 v_task_count integer;
 v_allowed_tasks constant text[] := array[
  'kitchen_benches','kitchen_sink','kitchen_cooktop','kitchen_appliances','kitchen_microwave','kitchen_fridge','kitchen_cupboards','kitchen_dishes','kitchen_floor_dry','kitchen_floor_mop','kitchen_bins',
  'bathroom_toilet','bathroom_basin','bathroom_shower','bathroom_mirror','bathroom_floor','bathroom_bins','bathroom_supplies',
  'living_dust','living_touchpoints','living_tidy','living_vacuum','living_mop','living_windows','living_entry',
  'bedroom_consent','bedroom_linen','bedroom_dust','bedroom_floor','bedroom_bin',
  'laundry_wash','laundry_dry','laundry_fold','laundry_putaway','laundry_area','laundry_lint',
  'safety_chemicals','safety_equipment','safety_hazards','safety_maintenance','safety_walkthrough'
 ];
begin
 perform public.require_verified_mfa();

 select * into v_profile
 from public.profiles
 where id=auth.uid() and active=true;

 if v_profile.id is null or v_profile.role not in ('staff','supervisor') then
  raise exception 'Only active workers can sign domestic duties checklists';
 end if;

 if p_declaration_confirmed is not true then
  raise exception 'Confirm that this checklist is true and only includes duties you completed';
 end if;

 if p_pin is null or p_pin !~ '^[0-9]{6}$' then
  raise exception 'Enter your six-digit signing PIN';
 end if;

 if v_profile.medication_pin_hash is null
    or crypt(p_pin,v_profile.medication_pin_hash)<>v_profile.medication_pin_hash then
  raise exception 'Incorrect PIN';
 end if;

 if not public.can_access_participant(p_participant_id) then
  raise exception 'You are not authorised for this participant';
 end if;

 select * into v_participant
 from public.participants
 where id=p_participant_id
   and organisation_id=v_profile.organisation_id
   and status='Active';

 if v_participant.id is null then
  raise exception 'Choose an active participant';
 end if;

 select * into v_shift
 from public.shifts
 where id=p_shift_id
   and organisation_id=v_profile.organisation_id
   and participant_id=p_participant_id
   and assigned_staff_id=v_profile.id
   and status::text='Published'
   and response::text='Accepted';

 if v_shift.id is null then
  raise exception 'Choose an accepted shift assigned to you for this participant';
 end if;

 if p_shift_date is null
    or p_shift_date < (v_shift.starts_at at time zone 'Australia/Brisbane')::date
    or p_shift_date > (v_shift.ends_at at time zone 'Australia/Brisbane')::date then
  raise exception 'The completion date must fall within the accepted shift';
 end if;

 if v_participant.service_scope_confirmed_at is not null
    and not public.participant_service_allowed(p_participant_id,'Domestic assistance',p_shift_date) then
  raise exception 'Domestic assistance is not in this participant''s confirmed service scope';
 end if;

 if p_tasks is null or jsonb_typeof(p_tasks)<>'object' then
  raise exception 'Domestic duties must be submitted as a checklist';
 end if;

 if exists (
  select 1 from jsonb_each(p_tasks) task
  where task.key<>all(v_allowed_tasks)
     or jsonb_typeof(task.value)<>'boolean'
     or task.value<>'true'::jsonb
 ) then
  raise exception 'The domestic duties checklist contains an invalid item';
 end if;

 select count(*) into v_task_count from jsonb_each(p_tasks);
 if v_task_count<1 or v_task_count>cardinality(v_allowed_tasks) then
  raise exception 'Tick at least one duty you completed';
 end if;

 insert into public.sil_records(
  organisation_id,participant_id,staff_id,record_type,category,title,fields,status,created_by,updated_by
 ) values (
  v_profile.organisation_id,p_participant_id,v_profile.id,
  'domesticChecklist','Domestic duties','Domestic duties checklist',
  jsonb_build_object(
   'participant',coalesce(nullif(v_participant.preferred_name,''),v_participant.full_name),
   'worker',v_profile.full_name,
   'shift_id',v_shift.id,
   'shift_date',p_shift_date,
   'shift_start',v_shift.starts_at,
   'shift_end',v_shift.ends_at,
   'tasks',p_tasks,
   'task_count',v_task_count,
   'participant_preferences',nullif(btrim(coalesce(p_participant_preferences,'')),''),
   'not_completed_reason',nullif(btrim(coalesce(p_not_completed_reason,'')),''),
   'follow_up_required',nullif(btrim(coalesce(p_follow_up_required,'')),''),
   'declaration_confirmed',true,
   'pin_verified',true,
   'signed_at',now()
  ),
  case when nullif(btrim(coalesce(p_follow_up_required,'')),'') is null then 'Complete' else 'Needs confirmation' end,
  v_profile.id,v_profile.id
 ) returning id into v_record_id;

 return v_record_id;
end;
$function$;

revoke all on function public.record_domestic_checklist(uuid,uuid,date,jsonb,text,text,text,text,boolean) from public;
revoke all on function public.record_domestic_checklist(uuid,uuid,date,jsonb,text,text,text,text,boolean) from anon;
grant execute on function public.record_domestic_checklist(uuid,uuid,date,jsonb,text,text,text,text,boolean) to authenticated;

comment on function public.record_domestic_checklist(uuid,uuid,date,jsonb,text,text,text,text,boolean)
is 'Creates an immutable PIN-signed domestic duties checklist linked to an authorised worker, participant and accepted shift.';

notify pgrst, 'reload schema';

do $$
begin
 if to_regprocedure('public.record_domestic_checklist(uuid,uuid,date,jsonb,text,text,text,text,boolean)') is null then
  raise exception 'Domestic duties checklist upgrade is not ready';
 end if;
 raise notice 'DOMESTIC_DUTY_CHECKLIST_READY';
end
$$;
