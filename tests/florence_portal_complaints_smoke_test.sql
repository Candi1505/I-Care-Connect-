\set ON_ERROR_STOP on

do $$
begin
 if has_function_privilege('anon','public.submit_portal_complaint(text,text,text,text)','execute') then
  raise exception 'Anonymous users can execute the complaint submission RPC';
 end if;
 if has_function_privilege('anon','public.reply_to_portal_complaint(uuid,text,text)','execute') then
  raise exception 'Anonymous users can execute the complaint reply RPC';
 end if;
 if not has_function_privilege('authenticated','public.submit_portal_complaint(text,text,text,text)','execute')
    or not has_function_privilege('authenticated','public.reply_to_portal_complaint(uuid,text,text)','execute') then
  raise exception 'Authenticated portal users cannot execute the complaint RPCs';
 end if;
end;
$$;

-- A second portal account linked to the same participant must not inherit the
-- complainant's private complaint conversation.
insert into auth.users(id,email) values
 ('00000000-0000-0000-0000-000000000004','client@example.test')
on conflict do nothing;
insert into public.profiles(id,organisation_id,participant_id,full_name,email,role,active)
values(
 '00000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001',
 '10000000-0000-0000-0000-000000000002','Test Participant Portal','client@example.test','client',true
)
on conflict(id) do nothing;

-- Family account submits one participant-linked complaint through the secured RPC.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 v_result record;
 v_count integer;
begin
 select * into v_result from public.submit_portal_complaint(
  'Portal complaint smoke test',
  'The family portal complaint needs a supervisor response.',
  'Please review and reply',
  'Test advocate'
 );
 if v_result.complaint_id is null or v_result.thread_id is null then
  raise exception 'Portal complaint RPC did not return linked IDs';
 end if;
 if not exists(
  select 1 from public.complaints
  where id=v_result.complaint_id and submitted_by=auth.uid()
    and participant_id='10000000-0000-0000-0000-000000000002'
    and channel='Portal' and status='Received' and portal_thread_id=v_result.thread_id
 ) then raise exception 'Family complaint was not recorded and linked'; end if;
 if not exists(
  select 1 from public.portal_threads
  where id=v_result.thread_id and thread_type='Complaint or feedback' and created_by=auth.uid()
 ) then raise exception 'Complaint portal thread was not created'; end if;
 select count(*) into v_count from public.portal_messages where thread_id=v_result.thread_id;
 if v_count<>1 then raise exception 'Expected one initial complaint message, got %',v_count; end if;

 update public.complaints set status='Resolved' where id=v_result.complaint_id;
 if (select status from public.complaints where id=v_result.complaint_id)<>'Received' then
  raise exception 'Family account directly changed complaint status';
 end if;
end;
$$;

reset role;

-- A different participant-portal login for the same participant cannot read
-- the complaint register entry, private thread or messages.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000004","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 v_count integer;
begin
 select count(*) into v_count from public.complaints where subject='Portal complaint smoke test';
 if v_count<>0 then raise exception 'Another portal account could read the private complaint'; end if;
 select count(*) into v_count from public.portal_threads where thread_type='Complaint or feedback';
 if v_count<>0 then raise exception 'Another portal account could read the private complaint thread'; end if;
 select count(*) into v_count
 from public.portal_messages message_record
 join public.portal_threads thread_record on thread_record.id=message_record.thread_id
 where thread_record.thread_type='Complaint or feedback';
 if v_count<>0 then raise exception 'Another portal account could read private complaint messages'; end if;
end;
$$;

reset role;

-- Supervisor receives the complaint, replies and moves it into review.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 v_id uuid;
begin
 select id into v_id from public.complaints where subject='Portal complaint smoke test';
 if not exists(
  select 1 from public.notifications
  where recipient_id=auth.uid() and related_record_id=v_id
    and title='New complaint or feedback'
 ) then raise exception 'Supervisor was not notified of the new complaint'; end if;
 perform public.reply_to_portal_complaint(v_id,'A supervisor is reviewing this complaint.','In review');
 if not exists(
  select 1 from public.complaints
  where id=v_id and status='In review' and acknowledged_at is not null
    and assigned_to=auth.uid() and resolved_at is null
 ) then raise exception 'Supervisor reply did not acknowledge and assign the complaint'; end if;
 if not exists(
  select 1 from public.notifications
  where recipient_id='00000000-0000-0000-0000-000000000003'
    and related_record_id=v_id and title='Supervisor replied to your complaint'
 ) then raise exception 'Family account was not notified of supervisor reply'; end if;
end;
$$;

reset role;

-- Family adds information; supervisors are notified without exposing another complaint.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 v_id uuid;
begin
 select id into v_id from public.complaints where subject='Portal complaint smoke test';
 perform public.reply_to_portal_complaint(v_id,'Here is the additional information requested.',null);
 if not exists(
  select 1 from public.notifications
  where recipient_id='00000000-0000-0000-0000-000000000001'
    and related_record_id=v_id and title='New reply to a complaint'
 ) then raise exception 'Supervisor was not notified of the family reply'; end if;
 if (select status from public.complaints where id=v_id)<>'In review' then
  raise exception 'Family reply changed the supervisor-controlled review status';
 end if;
end;
$$;

reset role;

-- Supervisor records the outcome and the linked portal thread closes as resolved.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',false);

do $$
declare
 v_id uuid;
 v_thread uuid;
begin
 select id,portal_thread_id into v_id,v_thread from public.complaints where subject='Portal complaint smoke test';
 perform public.reply_to_portal_complaint(v_id,'The complaint outcome has been recorded and shared.','Resolved');
 if not exists(
  select 1 from public.complaints
  where id=v_id and status='Resolved' and resolved_at is not null
    and outcome='The complaint outcome has been recorded and shared.'
    and appeal_information is not null
 ) then raise exception 'Supervisor resolution was not recorded completely'; end if;
 if not exists(select 1 from public.portal_threads where id=v_thread and status='Resolved') then
  raise exception 'Resolved complaint did not resolve the linked portal thread';
 end if;
end;
$$;

reset role;

select 'PORTAL_COMPLAINTS_SMOKE_PASS' as result;
