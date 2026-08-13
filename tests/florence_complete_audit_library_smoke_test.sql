\set ON_ERROR_STOP on

-- Production-equivalent privilege boundaries must remain in place.
do $$
begin
 if has_table_privilege('anon','public.audit_evidence_checks','SELECT') then
  raise exception 'Anonymous evidence-check access was granted';
 end if;
 if has_table_privilege('authenticated','public.controlled_document_approval_tickets','SELECT') then
  raise exception 'Approval tickets were exposed to browser sessions';
 end if;
 if has_function_privilege('anon','public.approve_controlled_document(uuid,date,date)','EXECUTE') then
  raise exception 'Anonymous controlled-document approval was granted';
 end if;
 if not has_function_privilege('authenticated','public.approve_controlled_document(uuid,date,date)','EXECUTE') then
  raise exception 'Authenticated approval RPC access is missing';
 end if;
 if has_function_privilege('authenticated','public.enforce_controlled_document_lifecycle()','EXECUTE') then
  raise exception 'Lifecycle trigger function is directly callable';
 end if;
end $$;

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config(
 'request.jwt.claims',
 '{"sub":"00000000-0000-0000-0000-000000000001","aal":"aal2","role":"authenticated"}',
 true
);

do $smoke$
declare
 document_id uuid;
 direct_approval_allowed boolean:=true;
begin
 insert into public.compliance_documents(
  organisation_id,scope,subject_name,category,title,storage_path,
  original_filename,mime_type,uploaded_by,catalogue_key,module,
  requirement_level,access_level,lifecycle_status
 ) values(
  '20000000-0000-0000-0000-000000000001','Organisation','Organisation',
  'Controlled library','Florence audit smoke test',
  '__smoke__/audit-library-document.pdf','audit-library-document.pdf',
  'application/pdf',auth.uid(),'__smoke-audit-library__','Core',
  'Required','supervisor','Draft'
 ) returning id into document_id;

 begin
  update public.compliance_documents
  set lifecycle_status='Approved'
  where id=document_id;
 exception when others then
  direct_approval_allowed:=false;
 end;
 if direct_approval_allowed then
  raise exception 'Direct controlled-document approval was allowed';
 end if;

 perform public.approve_controlled_document(
  document_id,current_date+365,current_date
 );

 if not exists(
  select 1 from public.compliance_documents
  where id=document_id
    and lifecycle_status='Approved'
    and approved_by=auth.uid()
    and review_date=current_date+365
 ) then
  raise exception 'Guarded controlled-document approval failed';
 end if;

 insert into public.audit_evidence_checks(
  organisation_id,evidence_key,status,notes,reviewed_by
 ) values(
  '20000000-0000-0000-0000-000000000001','__smoke-evidence__',
  'In progress','Transactional verification only',auth.uid()
 );

 update public.audit_evidence_checks
 set status='Ready',reviewed_at=now(),reviewed_by=auth.uid()
 where organisation_id='20000000-0000-0000-0000-000000000001'
   and evidence_key='__smoke-evidence__';

 if not exists(
  select 1 from public.audit_evidence_checks
  where organisation_id='20000000-0000-0000-0000-000000000001'
    and evidence_key='__smoke-evidence__'
    and status='Ready'
    and reviewed_by=auth.uid()
 ) then
  raise exception 'Audit evidence save/update failed';
 end if;
end;
$smoke$;

rollback;

select 'COMPLETE_AUDIT_LIBRARY_SMOKE_PASS' as result;
