\set ON_ERROR_STOP on

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 v_record_id uuid;
 v_wrong_pin_denied boolean:=false;
begin
 begin
  perform public.record_domestic_checklist(
   '10000000-0000-0000-0000-000000000002',
   '40000000-0000-0000-0000-000000000002',
   (select (starts_at at time zone 'Australia/Brisbane')::date from public.shifts where id='40000000-0000-0000-0000-000000000002'),
   '{"kitchen_floor_mop":true}'::jsonb,
   'Participant requested the kitchen first.',
   '',
   '',
   '000000',
   true
  );
 exception when others then
  if sqlerrm='Incorrect PIN' then v_wrong_pin_denied:=true; else raise; end if;
 end;

 if not v_wrong_pin_denied then
  raise exception 'An incorrect domestic checklist PIN was not denied';
 end if;

 select public.record_domestic_checklist(
  '10000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  (select (starts_at at time zone 'Australia/Brisbane')::date from public.shifts where id='40000000-0000-0000-0000-000000000002'),
  '{"kitchen_floor_mop":true,"living_vacuum":true,"living_windows":true,"safety_walkthrough":true}'::jsonb,
  'Participant chose the order of cleaning.',
  'Bedroom was not required.',
  '',
  '246810',
  true
 ) into v_record_id;

 if not exists(
  select 1 from public.sil_records
  where id=v_record_id
    and participant_id='10000000-0000-0000-0000-000000000002'
    and staff_id=auth.uid()
    and created_by=auth.uid()
    and record_type='domesticChecklist'
    and category='Domestic duties'
    and status='Complete'
    and fields->>'task_count'='4'
    and fields->>'pin_verified'='true'
    and fields->'tasks'->>'living_windows'='true'
 ) then
  raise exception 'Domestic duties evidence was not stored correctly';
 end if;
end;
$$;

reset role;
select 'DOMESTIC_DUTY_CHECKLIST_SMOKE_PASS' as florence_domestic_duty_checklist_smoke_test;
