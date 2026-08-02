\set ON_ERROR_STOP on

-- Add a retained Schedule 8 medication for the assigned test participant.
insert into public.medications(
 id,organisation_id,participant_id,medication_name,dose,route,
 administration_time,medication_type,active,created_by
) values(
 '30000000-0000-0000-0000-000000000003',
 '20000000-0000-0000-0000-000000000001',
 '10000000-0000-0000-0000-000000000002',
 'Schedule 8 Test Medication','1 tablet','Oral','10:00','Schedule 8',true,
 '00000000-0000-0000-0000-000000000001'
) on conflict(id) do nothing;

-- Give the supervisor/witness a private signing PIN.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',false);
select public.set_my_signing_pin('135790');
reset role;

-- Exercise the assigned worker's Schedule 8 workflow.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 v_s8_mar_id uuid;
 v_note_id uuid;
 v_stock_id uuid;
 v_missing_witness_denied boolean:=false;
 v_same_worker_denied boolean:=false;
 v_wrong_witness_pin_denied boolean:=false;
 v_direct_register_insert_denied boolean:=false;
begin
 begin
  perform public.record_medication_administration(
   '30000000-0000-0000-0000-000000000003','246810',
   'Administered'::public.mar_status,null
  );
 exception when others then
  if sqlerrm='Schedule 8 administration requires a second worker' then
   v_missing_witness_denied:=true;
  else
   raise;
  end if;
 end;
 if not v_missing_witness_denied then
  raise exception 'Schedule 8 administration was allowed without a witness';
 end if;

 begin
  perform public.record_medication_administration(
   '30000000-0000-0000-0000-000000000003','246810',
   'Administered'::public.mar_status,null,
   auth.uid(),'246810',1,9
  );
 exception when others then
  if sqlerrm='The Schedule 8 witness must be a different worker' then
   v_same_worker_denied:=true;
  else
   raise;
  end if;
 end;
 if not v_same_worker_denied then
  raise exception 'A worker was allowed to witness their own Schedule 8 administration';
 end if;

 begin
  perform public.record_medication_administration(
   '30000000-0000-0000-0000-000000000003','246810',
   'Administered'::public.mar_status,null,
   '00000000-0000-0000-0000-000000000001','000000',1,9
  );
 exception when others then
  if sqlerrm='Incorrect witness PIN' then
   v_wrong_witness_pin_denied:=true;
  else
   raise;
  end if;
 end;
 if not v_wrong_witness_pin_denied then
  raise exception 'An incorrect Schedule 8 witness PIN was not denied';
 end if;

 select public.record_medication_administration(
  '30000000-0000-0000-0000-000000000003','246810',
  'Administered'::public.mar_status,'Dual-signoff smoke test',
  '00000000-0000-0000-0000-000000000001','135790',1,9
 ) into v_s8_mar_id;
 if v_s8_mar_id is null then
  raise exception 'Dual-signed Schedule 8 MAR returned no ID';
 end if;

 select public.record_progress_note(
  '10000000-0000-0000-0000-000000000002',
  'Daily support','Automatic timeline progress-note smoke test',
  'Final','246810',true
 ) into v_note_id;
 if v_note_id is null then
  raise exception 'Timeline progress-note smoke test returned no ID';
 end if;

 select public.record_controlled_drug_transaction(
  '10000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000003',
  'Count check',0,9,'End-of-shift stock count',
  '246810','00000000-0000-0000-0000-000000000001','135790'
 ) into v_stock_id;
 if v_stock_id is null then
  raise exception 'Dual-signed Schedule 8 stock transaction returned no ID';
 end if;

 begin
  insert into public.controlled_drug_register(
   organisation_id,participant_id,medication_id,transaction_type,
   quantity,balance,recorded_by,witnessed_by,
   recorded_pin_verified,witness_pin_verified,witnessed_at
  ) values(
   '20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000002',
   '30000000-0000-0000-0000-000000000003',
   'Count check',0,9,auth.uid(),
   '00000000-0000-0000-0000-000000000001',true,true,now()
  );
 exception when insufficient_privilege then
  v_direct_register_insert_denied:=true;
 end;
 if not v_direct_register_insert_denied then
  raise exception 'Direct Schedule 8 register insert was allowed';
 end if;
end;
$$;

reset role;

-- Verify permanent dual-signature evidence and timeline linkage.
do $$
declare
 v_mar_id uuid;
 v_note_id uuid;
begin
 select id into v_mar_id
 from public.mar_entries
 where medication_id='30000000-0000-0000-0000-000000000003'
   and status='Administered'
 order by recorded_at desc limit 1;

 if v_mar_id is null then
  raise exception 'Dual-signed Schedule 8 MAR is missing';
 end if;
 if not exists(
  select 1 from public.mar_entries
  where id=v_mar_id
    and staff_id='00000000-0000-0000-0000-000000000002'
    and witnessed_by='00000000-0000-0000-0000-000000000001'
    and pin_verified and witness_pin_verified and dual_signoff_required
    and witnessed_at is not null and s8_quantity=1 and s8_balance=9
 ) then
  raise exception 'Schedule 8 MAR did not retain complete dual-signoff evidence';
 end if;
 if not exists(
  select 1 from public.controlled_drug_register
  where mar_entry_id=v_mar_id
    and transaction_type='Administered'
    and recorded_by='00000000-0000-0000-0000-000000000002'
    and witnessed_by='00000000-0000-0000-0000-000000000001'
    and recorded_pin_verified and witness_pin_verified
    and quantity=1 and balance=9
 ) then
  raise exception 'Schedule 8 administration did not create its linked stock-register entry';
 end if;
 if not exists(
  select 1 from public.client_timeline
  where related_mar_entry_id=v_mar_id
    and participant_id='10000000-0000-0000-0000-000000000002'
    and event_type='Medication'
    and description like '%dual sign-off completed%'
 ) then
  raise exception 'Schedule 8 administration was not linked into the participant timeline';
 end if;

 select id into v_note_id
 from public.progress_notes
 where content='Automatic timeline progress-note smoke test';
 if v_note_id is null then
  raise exception 'Signed progress note is missing';
 end if;
 if not exists(
  select 1 from public.client_timeline
  where related_progress_note_id=v_note_id
    and participant_id='10000000-0000-0000-0000-000000000002'
    and title='Progress note — Daily support'
 ) then
  raise exception 'New progress note was not linked into the participant timeline';
 end if;

 if not exists(
  select 1
  from public.client_timeline timeline
  join public.progress_notes note on note.id=timeline.related_progress_note_id
  where note.content='Retained participant note'
 ) then
  raise exception 'Existing progress note was not backfilled into the participant timeline';
 end if;

 if not exists(
  select 1 from public.controlled_drug_register
  where medication_id='30000000-0000-0000-0000-000000000003'
    and transaction_type='Count check'
    and recorded_pin_verified and witness_pin_verified
 ) then
  raise exception 'Manual Schedule 8 stock transaction did not retain both PIN verifications';
 end if;
end;
$$;

select 'PASS' as florence_s8_dual_pin_and_timeline_smoke_test;
