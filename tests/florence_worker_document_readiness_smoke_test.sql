\set ON_ERROR_STOP on

begin;

update public.profiles
set medication_pin_hash = crypt('246810', gen_salt('bf'))
where id = '00000000-0000-0000-0000-000000000002';

insert into public.compliance_documents (
 id, organisation_id, scope, subject_name, category, title, storage_path,
 original_filename, mime_type, review_date, version, uploaded_by,
 module, requirement_level, access_level, lifecycle_status, approved_by, approved_at
) values
(
 '61000000-0000-0000-0000-000000000001',
 '20000000-0000-0000-0000-000000000001',
 'Organisation', 'I-Care Connect Test', 'Controlled library',
 'SIL Staff Handbook', '__smoke__/required-worker-policy.pdf',
 'required-worker-policy.pdf', 'application/pdf', current_date + 365, 1,
 '00000000-0000-0000-0000-000000000001', 'Core', 'Required', 'worker',
 'Approved', '00000000-0000-0000-0000-000000000001', now()
),
(
 '61000000-0000-0000-0000-000000000002',
 '20000000-0000-0000-0000-000000000001',
 'Organisation', 'I-Care Connect Test', 'Controlled library',
 'Supervisor Governance Policy', '__smoke__/supervisor-governance-policy.pdf',
 'supervisor-governance-policy.pdf', 'application/pdf', current_date + 365, 1,
 '00000000-0000-0000-0000-000000000001', 'Core', 'Required', 'supervisor',
 'Approved', '00000000-0000-0000-0000-000000000001', now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select set_config(
 'request.jwt.claims',
 '{"sub":"00000000-0000-0000-0000-000000000002","aal":"aal2","role":"authenticated"}',
 true
);

do $smoke$
declare
 blocked boolean := false;
 timesheet_id uuid;
 result_count integer;
begin
 if (select count(*) from public.compliance_documents) <> 1 then
  raise exception 'Worker RLS exposed supervisor-only controlled documents';
 end if;

 begin
  perform public.clock_in_timesheet(null, 'Administration / office work', 'must be blocked');
 exception when others then
  if sqlerrm like 'Read and acknowledge all current worker documents before clocking in.%' then
   blocked := true;
  else
   raise;
  end if;
 end;
 if not blocked then
  raise exception 'Clock-in was allowed before required reading';
 end if;

 perform public.record_worker_document_open('61000000-0000-0000-0000-000000000001');
 select public.acknowledge_worker_documents(
  array['61000000-0000-0000-0000-000000000001'::uuid],
  '246810', true
 ) into result_count;
 if result_count <> 1 then
  raise exception 'Expected one signed worker-document acknowledgement';
 end if;

 if not exists (
  select 1 from public.my_worker_document_readiness()
  where document_id = '61000000-0000-0000-0000-000000000001'
    and ready = true
 ) then
  raise exception 'Worker document did not become ready after open and acknowledgement';
 end if;

 select public.clock_in_timesheet(
  null, 'Administration / office work', 'readiness smoke test'
 ) into timesheet_id;
 if timesheet_id is null then
  raise exception 'Clock-in did not unlock after all required reading';
 end if;
 perform public.clock_out_timesheet(0, 'readiness smoke complete');
end;
$smoke$;

rollback;

select 'WORKER_DOCUMENT_READINESS_SMOKE_PASS' as result;
