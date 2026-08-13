-- Florence complete Core + Module 5A audit-library controls
-- Additive and non-destructive. Prepare and verify a production backup first.
-- Do not apply until both required Florence Edge Functions and the backup have
-- been confirmed under the agreed release hold.

begin;

do $requirements$
begin
 if to_regclass('public.compliance_documents') is null
    or to_regclass('public.audit_events') is null
    or to_regprocedure('public.audit_row_change()') is null
    or to_regprocedure('public.require_verified_mfa()') is null
    or to_regprocedure('public.current_org_id()') is null
    or to_regprocedure('public.is_supervisor()') is null
    or to_regprocedure('public.is_worker_controlled_document(text)') is null then
  raise exception 'Apply the Florence audit-readiness, production-hardening and controlled-library migrations first';
 end if;
end;
$requirements$;

alter table public.compliance_documents
 add column if not exists catalogue_key text,
 add column if not exists module text,
 add column if not exists requirement_level text,
 add column if not exists access_level text,
 add column if not exists lifecycle_status text,
 add column if not exists effective_date date,
 add column if not exists approved_by uuid references public.profiles(id) on delete restrict,
 add column if not exists approved_at timestamptz;

alter table public.compliance_documents
 drop constraint if exists compliance_documents_module_check,
 add constraint compliance_documents_module_check
  check(module is null or module in('Core','Module 5A')),
 drop constraint if exists compliance_documents_requirement_level_check,
 add constraint compliance_documents_requirement_level_check
  check(requirement_level is null or requirement_level in('Required','Conditional')),
 drop constraint if exists compliance_documents_access_level_check,
 add constraint compliance_documents_access_level_check
  check(access_level is null or access_level in('worker','supervisor')),
 drop constraint if exists compliance_documents_lifecycle_status_check,
 add constraint compliance_documents_lifecycle_status_check
  check(lifecycle_status is null or lifecycle_status in('Draft','Needs review','Approved','Superseded','Archived')),
 drop constraint if exists compliance_documents_controlled_metadata_check,
 add constraint compliance_documents_controlled_metadata_check
  check(
   category is distinct from 'Controlled library'
   or (
    catalogue_key is not null and btrim(catalogue_key)<>''
    and module is not null
    and requirement_level is not null
    and access_level is not null
    and lifecycle_status is not null
   )
  ) not valid;

-- Legacy 44-file imports remain private and visible to supervisors, but they
-- must be reviewed and approved under the new lifecycle before worker access.
update public.compliance_documents
set lifecycle_status=coalesce(lifecycle_status,'Needs review'),
    module=coalesce(module,case when title like 'SIL %' or title in(
      'Position Description — SIL Team Leader',
      'Position Description — Disability Support Worker (SIL)'
    ) then 'Module 5A' else 'Core' end),
    requirement_level=coalesce(requirement_level,'Required'),
    access_level=coalesce(access_level,case when public.is_worker_controlled_document(title) then 'worker' else 'supervisor' end),
    catalogue_key=coalesce(catalogue_key,'legacy-'||id::text)
where category='Controlled library';

alter table public.compliance_documents validate constraint compliance_documents_controlled_metadata_check;

create index if not exists compliance_documents_catalogue_idx
 on public.compliance_documents(organisation_id,catalogue_key,uploaded_at desc)
 where category='Controlled library';
create index if not exists compliance_documents_worker_library_idx
 on public.compliance_documents(organisation_id,title,lifecycle_status,review_date)
 where category='Controlled library';

-- Transaction-scoped approval tickets make it impossible to turn a draft into
-- an approved worker document through a direct browser update.
create table if not exists public.controlled_document_approval_tickets(
 transaction_id bigint not null,
 document_id uuid not null references public.compliance_documents(id) on delete cascade,
 approver_id uuid not null references public.profiles(id) on delete cascade,
 primary key(transaction_id,document_id,approver_id)
);
alter table public.controlled_document_approval_tickets enable row level security;
revoke all on public.controlled_document_approval_tickets from public,anon,authenticated;

create or replace function public.enforce_controlled_document_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
 if new.category is distinct from 'Controlled library' then return new; end if;
 perform public.require_verified_mfa();
 if tg_op='INSERT' and new.lifecycle_status<>'Draft' then
  raise exception 'New controlled documents must begin as drafts';
 end if;
 if tg_op='UPDATE' then
  if new.lifecycle_status='Approved' and old.lifecycle_status is distinct from 'Approved'
     and not exists(
      select 1 from public.controlled_document_approval_tickets ticket
      where ticket.transaction_id=txid_current()
        and ticket.document_id=new.id
        and ticket.approver_id=auth.uid()
     ) then
   raise exception 'Use approve_controlled_document to approve a controlled document';
  end if;
  if old.lifecycle_status='Approved' and (
    new.title is distinct from old.title
    or new.storage_path is distinct from old.storage_path
    or new.version is distinct from old.version
    or new.catalogue_key is distinct from old.catalogue_key
    or new.module is distinct from old.module
    or new.requirement_level is distinct from old.requirement_level
    or new.access_level is distinct from old.access_level
   ) then
   new.lifecycle_status:='Draft';
   new.approved_by:=null;
   new.approved_at:=null;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.enforce_controlled_document_lifecycle() from public;

drop trigger if exists compliance_documents_controlled_lifecycle
 on public.compliance_documents;
create trigger compliance_documents_controlled_lifecycle
before insert or update on public.compliance_documents
for each row execute function public.enforce_controlled_document_lifecycle();

create or replace function public.approve_controlled_document(
 p_document_id uuid,
 p_review_date date,
 p_effective_date date default current_date
) returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_document public.compliance_documents%rowtype;
begin
 perform public.require_verified_mfa();
 if not public.is_supervisor() then
  raise exception 'Only a Florence supervisor can approve controlled documents';
 end if;
 if p_review_date is null or p_review_date<current_date then
  raise exception 'The next review date must be current or future';
 end if;
 if p_effective_date is null or p_effective_date>current_date then
  raise exception 'The effective date cannot be in the future';
 end if;
 select * into v_document
 from public.compliance_documents
 where id=p_document_id
   and organisation_id=public.current_org_id()
   and category='Controlled library'
 for update;
 if v_document.id is null then raise exception 'Controlled document not found'; end if;

 insert into public.controlled_document_approval_tickets(transaction_id,document_id,approver_id)
 values(txid_current(),v_document.id,auth.uid());

 update public.compliance_documents
 set lifecycle_status='Superseded'
 where organisation_id=v_document.organisation_id
   and category='Controlled library'
   and title=v_document.title
   and id<>v_document.id
   and lifecycle_status='Approved';

 update public.compliance_documents
 set lifecycle_status='Approved',
     review_date=p_review_date,
     effective_date=p_effective_date,
     approved_by=auth.uid(),
     approved_at=now()
 where id=v_document.id;

 delete from public.controlled_document_approval_tickets
 where transaction_id=txid_current()
   and document_id=v_document.id
   and approver_id=auth.uid();
end;
$$;
revoke all on function public.approve_controlled_document(uuid,date,date) from public;
grant execute on function public.approve_controlled_document(uuid,date,date) to authenticated;

create table if not exists public.audit_evidence_checks(
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 evidence_key text not null,
 status text not null default 'Not checked' check(status in('Not checked','In progress','Ready','Not applicable')),
 notes text,
 reviewed_by uuid not null references public.profiles(id) on delete restrict,
 reviewed_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(organisation_id,evidence_key),
 constraint audit_evidence_notes_length check(notes is null or char_length(notes)<=4000)
);
alter table public.audit_evidence_checks enable row level security;

drop policy if exists audit_evidence_checks_supervisor_select on public.audit_evidence_checks;
create policy audit_evidence_checks_supervisor_select
on public.audit_evidence_checks for select to authenticated
using(public.is_supervisor() and organisation_id=public.current_org_id());

drop policy if exists audit_evidence_checks_supervisor_insert on public.audit_evidence_checks;
create policy audit_evidence_checks_supervisor_insert
on public.audit_evidence_checks for insert to authenticated
with check(
 coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and organisation_id=public.current_org_id()
 and reviewed_by=auth.uid()
);

drop policy if exists audit_evidence_checks_supervisor_update on public.audit_evidence_checks;
create policy audit_evidence_checks_supervisor_update
on public.audit_evidence_checks for update to authenticated
using(public.is_supervisor() and organisation_id=public.current_org_id())
with check(
 coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and public.is_supervisor()
 and organisation_id=public.current_org_id()
 and reviewed_by=auth.uid()
);

grant select,insert,update on public.audit_evidence_checks to authenticated;

drop trigger if exists audit_evidence_checks_audit on public.audit_evidence_checks;
create trigger audit_evidence_checks_audit
after insert or update or delete on public.audit_evidence_checks
for each row execute function public.audit_row_change();

-- Exact worker whitelist. Anything not listed remains supervisor-only even if
-- a user learns its private Storage path.
create or replace function public.is_worker_controlled_document(p_title text)
returns boolean
language sql
immutable
set search_path=public,pg_temp
as $$
 select coalesce(p_title,'') = any(array[
  'SIL Staff Handbook',
  'Participant Rights and Responsibilities Policy',
  'Incident Report Form',
  'Feedback and Complaints Form',
  'Advocate or Support Person Request Form',
  'Participant Support Plan — SIL',
  'Privacy Consent Form — Easy Read',
  'Privacy Consent Form',
  'Participant File Notes — SIL',
  'Participant Emergency Plan — SIL',
  'Participant Risk Assessment Form — SIL',
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
  'Incident Management Policy',
  'Participant Information Booklet',
  'Participant Information Booklet — Easy Read',
  'Feedback and Complaints Summary',
  'Participant Cash Reconciliation Register',
  'Waste Management Register',
  'WHS Risk Management Matrix',
  'Emergency Waste Management Plan',
  'Business Continuity, Emergency Response and Disaster Management Plan',
  'Waste Management Policy',
  'Mealtime Risk Assessment Checklist',
  'Mealtime Management Plan',
  'Hazard Identification Checklist',
  'Medication Consent Form',
  'Home Risk Assessment Checklist',
  'Management of Medication Policy',
  'Mealtime Management Policy',
  'Participant Satisfaction Survey',
  'Participant Money and Property Policy',
  'Medication Competency Assessment',
  'Medication Incident Report Form',
  'Medication Plan and Administration Form',
  'Participant Money and Property Declaration',
  'Position Description — Disability Support Worker',
  'Medicine Register',
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
  'SIL Tenancy, Housing and Support Arrangements Policy',
  'SIL Visitor and Private Space Guidance',
  'SIL House Rules and Shared Space Consultation Record',
  'SIL House Meeting and Participant Consultation Record'
 ]::text[]);
$$;
revoke all on function public.is_worker_controlled_document(text) from public;
grant execute on function public.is_worker_controlled_document(text) to authenticated;

drop policy if exists compliance_select on public.compliance_documents;
create policy compliance_select
on public.compliance_documents for select to authenticated
using(
 organisation_id=public.current_org_id()
 and (
  public.is_supervisor()
  or (
   scope='Organisation' and public.current_role()='staff'
   and category='Controlled library'
   and public.is_worker_controlled_document(title)
   and lifecycle_status='Approved'
   and review_date>=current_date
  )
  or (scope='Staff' and subject_id=auth.uid())
  or (scope='Participant' and public.can_access_participant(subject_id))
 )
);

drop policy if exists florence_storage_read on storage.objects;
create policy florence_storage_read
on storage.objects for select to authenticated
using(
 bucket_id='florence-private'
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and (
  (public.is_supervisor() and (storage.foldername(name))[1]=public.current_org_id()::text)
  or exists(
   select 1 from public.compliance_documents document_record
   where document_record.storage_path=name
     and document_record.organisation_id=public.current_org_id()
     and (
      (
       document_record.scope='Organisation' and public.current_role()='staff'
       and document_record.category='Controlled library'
       and public.is_worker_controlled_document(document_record.title)
       and document_record.lifecycle_status='Approved'
       and document_record.review_date>=current_date
      )
      or (document_record.scope='Staff' and document_record.subject_id=auth.uid())
      or (document_record.scope='Participant' and public.can_access_participant(document_record.subject_id))
     )
  )
 )
);

notify pgrst,'reload schema';
commit;

select 'COMPLETE_AUDIT_LIBRARY_READY' as florence_status,
       (select count(*) from public.audit_evidence_checks) as saved_evidence_checks,
       (select count(*) from public.compliance_documents where category='Controlled library') as controlled_document_versions;
