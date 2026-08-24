\set ON_ERROR_STOP on

update public.profiles
set medication_pin_hash = extensions.crypt('111111', extensions.gen_salt('bf'))
where id = '00000000-0000-0000-0000-000000000001';

insert into public.timesheets(
  id, organisation_id, staff_id, clock_in, break_minutes, notes, status
) values (
  '55000000-0000-0000-0000-000000000099',
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  now() - interval '2 days', 0, 'Stale clock-in smoke test', 'Open'
);

insert into public.timesheets(
  id, organisation_id, staff_id, clock_in, break_minutes, notes, status
) values (
  '55000000-0000-0000-0000-000000000098',
  '20000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  now() - interval '1 hour', 0, 'Current clock-in protection smoke test', 'Open'
);

grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","aal":"aal2","role":"authenticated"}',false);

do $$
begin
  begin
    perform public.supervisor_resolve_open_timesheet(
      '55000000-0000-0000-0000-000000000099', now() - interval '40 hours',
      30, 'Worker attempted supervisor correction', '111111'
    );
    raise exception 'Worker was allowed to resolve another worker timesheet';
  exception when others then
    if sqlerrm = 'Worker was allowed to resolve another worker timesheet' then raise; end if;
  end;
end $$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',false);

do $$
begin
  begin
    perform public.supervisor_resolve_open_timesheet(
      '55000000-0000-0000-0000-000000000098', now(),
      0, 'Attempted correction of a current clock-in', '111111'
    );
    raise exception 'Supervisor recovery changed a current clock-in';
  exception when others then
    if sqlerrm = 'Supervisor recovery changed a current clock-in' then raise; end if;
  end;
end $$;

select public.supervisor_resolve_open_timesheet(
  '55000000-0000-0000-0000-000000000099', now() - interval '40 hours',
  30, 'Worker forgot to clock out after the completed shift', '111111'
);

do $$
begin
  if not exists (
    select 1 from public.timesheets
    where id = '55000000-0000-0000-0000-000000000099'
      and clock_out is not null
      and clock_out > clock_in
      and break_minutes = 30
      and status = 'Submitted'
      and clock_out_notes like '%Supervisor correction:%'
  ) then
    raise exception 'Supervisor correction did not safely close the old timesheet';
  end if;

  if not exists (
    select 1 from public.audit_events
    where table_name = 'timesheets'
      and record_id = '55000000-0000-0000-0000-000000000099'
      and action = 'UPDATE'
      and after_data->>'event' = 'supervisor_stale_clock_in_resolved'
      and after_data->>'pin_verified' = 'true'
  ) then
    raise exception 'Supervisor timesheet correction audit evidence was not recorded';
  end if;
end $$;

reset role;

delete from public.timesheets
where id = '55000000-0000-0000-0000-000000000098';

select 'PASS' as florence_timesheet_recovery_smoke_test;
