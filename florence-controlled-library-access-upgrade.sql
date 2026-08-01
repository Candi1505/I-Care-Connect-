-- Florence controlled-library access boundary
-- Non-destructive. Run once after florence-production-hardening-upgrade.sql
-- and before giving workers access to the private 44-document library.

begin;

do $requirements$
begin
 if to_regclass('public.compliance_documents') is null then
  raise exception 'Florence compliance_documents table is required';
 end if;
 if to_regprocedure('public.current_org_id()') is null
    or to_regprocedure('public.current_role()') is null
    or to_regprocedure('public.is_supervisor()') is null
    or to_regprocedure('public.can_access_participant(uuid)') is null then
  raise exception 'Run the Florence production-hardening migration before this upgrade';
 end if;
end;
$requirements$;

-- This exact register is the frontline worker library. Any controlled-library
-- title not listed here remains supervisor-only, even if somebody knows its ID
-- or private storage path.
create or replace function public.is_worker_controlled_document(p_title text)
returns boolean
language sql
immutable
set search_path=public,pg_temp
as $$
 select coalesce(p_title,'') = any(array[
  'SIL Staff Handbook',
  'Position Description — Disability Support Worker (SIL)',
  'SIL Supported Decision-Making Policy',
  'SIL Safeguarding Policy',
  'SIL Practice Governance Policy',
  'SIL Participant Welcome and Rights Guide',
  'SIL Participant Communication and Decision-Making Profile',
  'SIL Worker Competency Checklist',
  'SIL Participant-Specific Worker Instruction Form',
  'SIL Worker House Induction Checklist',
  'SIL Shift Handover Form',
  'SIL Participant Choice and Daily Life Record',
  'Participant Emergency Plan — SIL',
  'Participant Risk Assessment Form — SIL',
  'Participant Rights and Responsibilities Policy',
  'Incident Report Form',
  'Feedback and Complaints Form',
  'Advocate or Support Person Request Form',
  'Participant Support Plan — SIL',
  'Privacy Consent Form — Easy Read',
  'Privacy Consent Form',
  'Participant File Notes — SIL',
  'Violence, Abuse, Neglect, Exploitation and Discrimination Policy',
  'Worker Declarations',
  'Conflict of Interest Policy',
  'Assessment and Provision of Supports Policy — SIL',
  'Worker Induction Checklist — SIL',
  'Infection Prevention and Control Policy',
  'Work Health and Safety Policy',
  'Continuous Improvement Policy',
  'Privacy and Information Management Policy',
  'Feedback and Complaints Policy',
  'Emergency and Disaster Management Policy',
  'Incident Management Policy'
 ]::text[]);
$$;

revoke all on function public.is_worker_controlled_document(text) from public;
grant execute on function public.is_worker_controlled_document(text) to authenticated;

-- Metadata visibility: supervisors may see the whole register. Support workers
-- may see organisation evidence generally, but only the approved frontline
-- subset when category = Controlled library.
drop policy if exists compliance_select on public.compliance_documents;
create policy compliance_select
on public.compliance_documents
for select
to authenticated
using (
 organisation_id=public.current_org_id()
 and (
  public.is_supervisor()
  or (
   scope='Organisation'
   and public.current_role()='staff'
   and (
    category is distinct from 'Controlled library'
    or public.is_worker_controlled_document(title)
   )
  )
  or (scope='Staff' and subject_id=auth.uid())
  or (scope='Participant' and public.can_access_participant(subject_id))
 )
);

-- Make the one-time controlled-library metadata import explicit rather than
-- relying only on the older broad supervisor policy.
drop policy if exists compliance_controlled_library_supervisor_insert
on public.compliance_documents;
create policy compliance_controlled_library_supervisor_insert
on public.compliance_documents
for insert
to authenticated
with check (
 coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and organisation_id=public.current_org_id()
 and scope='Organisation'
 and category='Controlled library'
 and uploaded_by=auth.uid()
);

drop policy if exists compliance_controlled_library_supervisor_update
on public.compliance_documents;
create policy compliance_controlled_library_supervisor_update
on public.compliance_documents
for update
to authenticated
using (
 public.is_supervisor()
 and organisation_id=public.current_org_id()
 and scope='Organisation'
 and category='Controlled library'
)
with check (
 coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and organisation_id=public.current_org_id()
 and scope='Organisation'
 and category='Controlled library'
 and uploaded_by=auth.uid()
);

grant select,insert,update on public.compliance_documents to authenticated;

-- Supabase Storage returns the newly-created object row after upload, and an
-- upsert also needs SELECT and UPDATE access. A supervisor therefore needs to
-- read an own-organisation path before its matching compliance metadata row
-- exists. Workers still require an authorised compliance_documents record.
drop policy if exists florence_storage_read on storage.objects;
create policy florence_storage_read
on storage.objects
for select
to authenticated
using (
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and (
  (
   public.is_supervisor()
   and (storage.foldername(name))[1]=public.current_org_id()::text
  )
  or exists (
   select 1
   from public.compliance_documents document_record
   where document_record.storage_path=name
     and document_record.organisation_id=public.current_org_id()
     and (
      (
       document_record.scope='Organisation'
       and public.current_role()='staff'
       and (
        document_record.category is distinct from 'Controlled library'
        or public.is_worker_controlled_document(document_record.title)
       )
      )
      or (document_record.scope='Staff' and document_record.subject_id=auth.uid())
      or (
       document_record.scope='Participant'
       and public.can_access_participant(document_record.subject_id)
      )
     )
  )
 )
);

drop policy if exists florence_storage_insert on storage.objects;
create policy florence_storage_insert
on storage.objects
for insert
to authenticated
with check (
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and (storage.foldername(name))[1]=public.current_org_id()::text
);

drop policy if exists florence_storage_update on storage.objects;
create policy florence_storage_update
on storage.objects
for update
to authenticated
using (
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and (storage.foldername(name))[1]=public.current_org_id()::text
)
with check (
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and (storage.foldername(name))[1]=public.current_org_id()::text
);

commit;
