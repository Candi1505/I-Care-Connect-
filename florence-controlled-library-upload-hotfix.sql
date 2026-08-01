-- Florence private controlled-library upload RLS hotfix
-- Non-destructive and safe to run after florence-controlled-library-access-upgrade.sql.
-- This fixes Supabase Storage uploads/upserts that were blocked before the
-- matching compliance_documents metadata row existed.

begin;

do $requirements$
begin
 if to_regclass('public.compliance_documents') is null then
  raise exception 'Florence compliance_documents table is required';
 end if;
 if to_regprocedure('public.current_org_id()') is null
    or to_regprocedure('public.current_role()') is null
    or to_regprocedure('public.is_supervisor()') is null
    or to_regprocedure('public.is_worker_controlled_document(text)') is null then
  raise exception 'Run florence-controlled-library-access-upgrade.sql before this hotfix';
 end if;
end;
$requirements$;

-- Explicit metadata permissions for the supervisor-only library importer.
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

-- The Storage API returns the inserted object row, and the Florence importer
-- uses upsert so it also needs SELECT and UPDATE. Supervisors can read/manage
-- only paths under their own organisation UUID. Workers still need a matching,
-- authorised compliance_documents record before they can read a private file.
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
