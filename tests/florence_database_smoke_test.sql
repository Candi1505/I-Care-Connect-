\set ON_ERROR_STOP on

-- Known fake records and all seeded dependencies must be gone.
do $$
begin
 if exists(select 1 from public.participants where lower(btrim(full_name))='mary jane') then
  raise exception 'Mary Jane was not removed';
 end if;
 if exists(select 1 from public.medications where lower(btrim(medication_name))='sifrol') then
  raise exception 'Sifrol was not removed';
 end if;
 if exists(select 1 from public.progress_notes where content='Fake Mary Jane note') then
  raise exception 'Mary Jane dependent progress note was not removed';
 end if;
 if exists(select 1 from public.incidents where description='Fake incident') then
  raise exception 'Mary Jane dependent incident was not removed';
 end if;
 if exists(select 1 from public.complaints where subject='Fake complaint') then
  raise exception 'Mary Jane dependent complaint was not removed';
 end if;
 if exists(select 1 from public.invoices where invoice_number='TEST-MARY') then
  raise exception 'Mary Jane dependent invoice was not removed';
 end if;
 if not exists(select 1 from public.participants where full_name='Retained Test Participant') then
  raise exception 'Non-target participant was incorrectly removed';
 end if;
 if not exists(select 1 from public.medications where medication_name='Retained Test Medication') then
  raise exception 'Non-target medication was incorrectly removed';
 end if;
end $$;

-- Supabase grants API roles table privileges separately from RLS. Recreate those
-- grants in the ephemeral PostgreSQL database so the assertions exercise RLS.
grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Worker session with verified MFA.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 participant_count integer;
 medication_count integer;
 timesheet_id uuid;
 direct_allowed boolean;
begin
 select count(*) into participant_count from public.participants;
 if participant_count<>1 then
  raise exception 'Assigned worker expected exactly one participant, got %',participant_count;
 end if;
 select count(*) into medication_count from public.medications;
 if medication_count<>1 then
  raise exception 'Assigned worker expected exactly one medication, got %',medication_count;
 end if;

 select public.clock_in_timesheet(null,'Administration / office work','database smoke test') into timesheet_id;
 if timesheet_id is null then raise exception 'Clock-in RPC returned no ID'; end if;
 perform public.clock_out_timesheet(0,'completed');
 if not exists(
  select 1 from public.timesheets
  where id=timesheet_id and staff_id=auth.uid() and status='Submitted'
    and work_type='Administration / office work' and clock_out is not null
 ) then
  raise exception 'Server-controlled clock in/out did not produce a submitted timesheet';
 end if;

 insert into public.sil_records(
  organisation_id,participant_id,record_type,category,title,fields,status,created_by,updated_by
 ) values(
  '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
  'choice','Supported decision-making','Worker choice smoke test',
  '{"participant":"Retained Test Participant","choice":"Test choice","declaration":"Yes"}'::jsonb,
  'Complete',auth.uid(),auth.uid()
 );

 direct_allowed:=true;
 begin
  insert into public.timesheets(organisation_id,staff_id,clock_in,status)
  values('20000000-0000-0000-0000-000000000001',auth.uid(),now()-interval '1 day','Open');
 exception when others then direct_allowed:=false;
 end;
 if direct_allowed then raise exception 'Direct worker timesheet insert was allowed'; end if;

 direct_allowed:=true;
 begin
  insert into public.mar_entries(
   organisation_id,medication_id,participant_id,staff_id,status,pin_verified
  ) values(
   '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002',auth.uid(),'Administered',false
  );
 exception when others then direct_allowed:=false;
 end;
 if direct_allowed then raise exception 'Direct worker MAR insert was allowed'; end if;

 direct_allowed:=true;
 begin
  insert into public.progress_notes(
   organisation_id,participant_id,staff_id,category,content,status,
   declaration_confirmed,pin_verified,signed_at
  ) values(
   '20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',
   auth.uid(),'Test','Direct unsafe note','Final',false,false,null
  );
 exception when others then direct_allowed:=false;
 end;
 if direct_allowed then raise exception 'Direct worker progress-note insert was allowed'; end if;

 direct_allowed:=true;
 begin
  insert into public.sil_records(
   organisation_id,record_type,category,title,fields,status,created_by,updated_by
  ) values(
   '20000000-0000-0000-0000-000000000001','house','SIL home','Unauthorised house record',
   '{}'::jsonb,'Complete',auth.uid(),auth.uid()
  );
 exception when others then direct_allowed:=false;
 end;
 if direct_allowed then raise exception 'Worker created a supervisor-only SIL record'; end if;
end $$;

reset role;

-- Confirm the database, rather than the browser, supplied recent timestamps.
do $$
begin
 if not exists(
  select 1 from public.timesheets
  where work_type='Administration / office work'
    and abs(extract(epoch from(now()-clock_in)))<120
    and abs(extract(epoch from(now()-clock_out)))<120
 ) then
  raise exception 'Clock timestamps were not generated during the database smoke test';
 end if;
end $$;

-- Family portal session: participant identity and portal messages only.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 value integer;
begin
 select count(*) into value from public.participants;
 if value<>1 then raise exception 'Family portal expected one linked participant, got %',value; end if;
 select count(*) into value from public.portal_threads;
 if value<>1 then raise exception 'Family portal expected one portal thread, got %',value; end if;
 select count(*) into value from public.portal_messages;
 if value<>1 then raise exception 'Family portal expected one portal message, got %',value; end if;
 select count(*) into value from public.medications;
 if value<>0 then raise exception 'Family portal could read raw medication rows'; end if;
 select count(*) into value from public.mar_entries;
 if value<>0 then raise exception 'Family portal could read raw MAR rows'; end if;
 select count(*) into value from public.progress_notes;
 if value<>0 then raise exception 'Family portal could read raw progress notes'; end if;
 select count(*) into value from public.client_timeline;
 if value<>0 then raise exception 'Family portal could read clinical timeline rows'; end if;
 select count(*) into value from public.incidents;
 if value<>0 then raise exception 'Family portal could read incident rows'; end if;
 select count(*) into value from public.shifts;
 if value<>0 then raise exception 'Family portal could read staff roster rows'; end if;
 select count(*) into value from public.sil_records;
 if value<>0 then raise exception 'Family portal could read SIL staff records'; end if;
end $$;

reset role;

-- Supervisor can retain organisation oversight.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 value integer;
begin
 select count(*) into value from public.participants;
 if value<>1 then raise exception 'Supervisor expected one retained participant, got %',value; end if;
 select count(*) into value from public.sil_records;
 if value<>1 then raise exception 'Supervisor expected one retained SIL smoke record, got %',value; end if;
 if not public.is_supervisor() then raise exception 'Supervisor helper returned false'; end if;
end $$;

reset role;

select 'PASS' as florence_database_migration_and_rls_smoke_test;
