-- Least-privilege and performance follow-up for the complete audit library.
-- Apply immediately after florence-complete-audit-library-upgrade.sql.

begin;

-- Evidence checks are supervisor-facing application data. Browser sessions do
-- not need DELETE, and anonymous sessions must not have any table privileges.
revoke all privileges on table public.audit_evidence_checks from public,anon;
grant select,insert,update on table public.audit_evidence_checks to authenticated;
grant all privileges on table public.audit_evidence_checks to service_role;

-- Approval tickets are transaction-scoped implementation details. They are
-- intentionally inaccessible through PostgREST and are written only by the
-- guarded SECURITY DEFINER approval RPC.
revoke all privileges on table public.controlled_document_approval_tickets
 from public,anon,authenticated;
grant all privileges on table public.controlled_document_approval_tickets
 to service_role;

-- The lifecycle trigger is not a public RPC. PostgreSQL can still invoke it as
-- a trigger after direct EXECUTE access is removed from browser roles.
revoke all on function public.enforce_controlled_document_lifecycle()
 from public,anon,authenticated;
grant execute on function public.enforce_controlled_document_lifecycle()
 to service_role;

-- This RPC is intentionally callable by authenticated users because its body
-- enforces verified MFA, supervisor role, organisation scope and document
-- locking before creating the transaction-scoped approval ticket.
revoke all on function public.approve_controlled_document(uuid,date,date)
 from public,anon;
grant execute on function public.approve_controlled_document(uuid,date,date)
 to authenticated,service_role;

revoke all on function public.is_worker_controlled_document(text)
 from public,anon;
grant execute on function public.is_worker_controlled_document(text)
 to authenticated,service_role;

drop policy if exists audit_evidence_checks_supervisor_select
 on public.audit_evidence_checks;
create policy audit_evidence_checks_supervisor_select
on public.audit_evidence_checks for select to authenticated
using(
 (select public.is_supervisor())
 and organisation_id=(select public.current_org_id())
);

drop policy if exists audit_evidence_checks_supervisor_insert
 on public.audit_evidence_checks;
create policy audit_evidence_checks_supervisor_insert
on public.audit_evidence_checks for insert to authenticated
with check(
 coalesce((select auth.jwt())->>'aal','aal1')='aal2'
 and (select public.is_supervisor())
 and organisation_id=(select public.current_org_id())
 and reviewed_by=(select auth.uid())
);

drop policy if exists audit_evidence_checks_supervisor_update
 on public.audit_evidence_checks;
create policy audit_evidence_checks_supervisor_update
on public.audit_evidence_checks for update to authenticated
using(
 (select public.is_supervisor())
 and organisation_id=(select public.current_org_id())
)
with check(
 coalesce((select auth.jwt())->>'aal','aal1')='aal2'
 and (select public.is_supervisor())
 and organisation_id=(select public.current_org_id())
 and reviewed_by=(select auth.uid())
);

-- Index every foreign-key side so lifecycle cleanup and reviewer joins remain
-- efficient as the evidence register grows.
create index if not exists audit_evidence_checks_reviewed_by_idx
 on public.audit_evidence_checks(reviewed_by);
create index if not exists controlled_document_approval_tickets_document_idx
 on public.controlled_document_approval_tickets(document_id);
create index if not exists controlled_document_approval_tickets_approver_idx
 on public.controlled_document_approval_tickets(approver_id);

notify pgrst,'reload schema';
commit;

select 'COMPLETE_AUDIT_LIBRARY_HARDENED' as florence_status;
