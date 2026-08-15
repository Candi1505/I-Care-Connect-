from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
FAILURES: list[str] = []
PASSES: list[str] = []


def text(path: str) -> str:
    file_path = ROOT / path
    if not file_path.exists():
        FAILURES.append(f"missing required file: {path}")
        return ""
    return file_path.read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    (PASSES if condition else FAILURES).append(message)


def contains(path: str, *markers: str) -> None:
    source = text(path)
    for marker in markers:
        require(marker in source, f"{path} contains {marker!r}")


class IdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if key == "id" and value:
                self.ids.append(value)


required_files = [
    "index.html", "styles.css", "config.js", "app.js", "operations.js",
    "staff-management.js", "set-password.html", "set-password.js",
    "medication-prn-fix.js", "participant-edit-controls.js", "portal-complaints.js", "client-onboarding.js",
    "sil.html", "sil-record.html", "sil.css", "sil.js", "sil-record.js", "service-worker.js",
    "audit-document-catalogue.js",
    "supabase/functions/staff-management/index.ts",
    "supabase/functions/xero-connect/index.ts",
    "supabase/functions/deputy-connect/index.ts",
    "supabase/functions/account-setup-admin/index.ts",
    "supabase/functions/account-setup/index.ts",
    "supabase/functions/push-dispatch/index.ts",
    "supabase/functions/bright-worker/index.ts",
    "supabase/functions/bright-service/index.ts",
    "florence-production-audit-hardening.sql",
    "florence-production-hardening-upgrade.sql",
    "florence-controlled-library-access-upgrade.sql",
    "florence-controlled-library-upload-hotfix.sql",
    "florence-complete-audit-library-upgrade.sql",
    "florence-complete-audit-library-security-hardening.sql",
    "florence-final-readiness-upgrade.sql",
    "florence-s8-dual-signoff-timeline-upgrade.sql",
    "florence-portal-complaints-upgrade.sql",
    "florence-multi-client-service-scope.sql",
    "florence-choice-evidence-timeline-fix.sql",
]
for path in required_files:
    require((ROOT / path).exists(), f"required file exists: {path}")

# HTML structure and controlled dependencies.
for path in ["index.html", "set-password.html", "sil.html", "sil-record.html"]:
    parser = IdParser()
    parser.feed(text(path))
    duplicates = {key: value for key, value in Counter(parser.ids).items() if value > 1}
    require(not duplicates, f"{path} contains no duplicate IDs: {duplicates}")

index = text("index.html")
modern_asset_match = re.search(r'src="(/assets/index-[A-Za-z0-9_-]+\.js)"', index)
modern_app = text(modern_asset_match.group(1).lstrip("/")) if modern_asset_match else ""
modern_index = bool(modern_app)
set_password_html = text("set-password.html")
set_password = text("set-password.js")
sil_html = text("sil.html")
sil_js = text("sil.js")
sil_record_html = text("sil-record.html")
sil_record_js = text("sil-record.js")
service_worker = text("service-worker.js")
headers = text("_headers")
config = text("config.js")
app_js = text("app.js")
readiness_controls = text("florence-readiness-controls.js")
portal_complaints = text("portal-complaints.js")
quality_gate = text(".github/workflows/florence-quality-gate.yml")

require(
    "@supabase/supabase-js@2.106.2" in index
    or (modern_index and re.search(r'href="/assets/supabase-[A-Za-z0-9_-]+\.js"', index)),
    "index pins Supabase JS 2.106.2",
)
require("@supabase/supabase-js@2.106.2" in sil_html, "sil.html pins Supabase JS 2.106.2")
require("@supabase/supabase-js@2.106.2" in sil_record_html, "evidence page pins Supabase JS 2.106.2")
require("@supabase/supabase-js" not in set_password_html, "setup page does not create a browser Supabase session")
require('app.js?v=20260813-multi-client-1' in index or modern_index, "index loads current multi-client app asset")
require('config.js?v=20260813-multi-client-1' in index or modern_index, "index loads the current runtime configuration")
require('operations.js?v=20260813-multi-client-1' in index or modern_index, "index loads the current operations asset")
require('audit-document-catalogue.js?v=20260813-audit-library-1' in sil_html, "SIL page loads the complete audit catalogue")
require('sil.js?v=20260814-domestic-duty-1' in sil_html, "SIL page loads current participant-template asset")
require('sil.css?v=20260814-domestic-duty-1' in sil_html, "SIL page loads current audit-library styles")
require('sil-record.js?v=20260814-domestic-duty-1' in sil_record_html, "evidence page loads its current secure viewer")
require('set-password.js?v=20260802-2' in set_password_html, "setup page loads its controlled asset")
require('florence-static-20260814-domestic-duty-1' in service_worker, "service worker uses current cache namespace")
for marker in ['styles.css?v=20260813-multi-client-1', 'config.js?v=20260813-multi-client-1', 'app.js?v=20260813-multi-client-1', 'operations.js?v=20260813-multi-client-1', 'medication-prn-fix.js?v=20260812-mobile-regressions-1', 'portal-care-plan.js?v=20260812-mobile-regressions-1', 'portal-complaints.js?v=20260813-portal-complaints-1', 'client-onboarding.js?v=20260813-multi-client-1', 'roster-30-day.js?v=20260812-mobile-regressions-1', 'sil.css?v=20260814-domestic-duty-1', 'audit-document-catalogue.js?v=20260813-audit-library-1', 'sil.js?v=20260814-domestic-duty-1', 'sil-record.js?v=20260814-domestic-duty-1']:
    require(marker in service_worker, f"service worker caches {marker}")

require(
    'id="weekly-family-update-list"' in index
    or (modern_index and "Weekly family updates" in modern_app),
    "portal contains a visible weekly family update record list",
)
require('db.from("weekly_family_updates").select("*")' in app_js, "main refresh loads saved weekly family updates")
require('function renderWeeklyFamilyUpdates()' in app_js, "main portal renders saved weekly family updates")
require('data-review-weekly-update' in app_js, "supervisor can review a weekly family update")
require('weekly_family_updates:"weeklyFamilyUpdates"' in app_js, "weekly family updates are included in encrypted organisation archives")
require('data-weekly-thread' in app_js, "weekly update can open its linked family conversation")
require(
    ('id="portal-complaints-section"' in index and 'data-portal-section="complaints"' in index)
    or (modern_index and "Complaints & feedback" in modern_app),
    "family and participant portal has a dedicated Complaints tab",
)
require(
    ('id="portal-complaint-reply-form"' in index and 'id="portal-complaint-status"' in index)
    or (modern_index and "Send reply" in modern_app and "Review now" in modern_app),
    "complaints tab includes reply and supervisor review controls",
)
require('portal-complaints.js?v=20260813-portal-complaints-1' in config, "runtime loads the controlled portal complaints module")
contains(
    "portal-complaints.js",
    'db.rpc("submit_portal_complaint"',
    'db.rpc("reply_to_portal_complaint"',
    'item.channel==="Portal"||item.portal_thread_id',
    'isPortalComplainant()||isSupervisor()',
)
require(
    'If someone is in immediate danger, call 000.' in index
    or (modern_index and "Complaints & feedback" in modern_app and "Incident report" in modern_app),
    "complaints tab distinguishes the portal workflow from an emergency response",
)
require('t.thread_type!=="Complaint or feedback"' in app_js, "formal complaint conversations are kept out of the general message list")
require('"Complaint or feedback","Information update"' not in app_js, "generic message form no longer creates a non-atomic complaint")
require('medication-administration-actions' in app_js, "medication administration actions have responsive layout hooks")
require('Edit medication' in readiness_controls, "medication maintenance action uses a clear label")

for record_type in ['supportPlan', 'emergencyPlan', 'riskAssessment', 'intake', 'communication', 'instructions', 'choice']:
    require(f'data-open-form="{record_type}"' in sil_html, f"daily delivery exposes {record_type}")
    require(f'{record_type}:' in sil_js, f"daily delivery defines {record_type} form")
require('sil-readiness' in sil_html and 'renderReadiness' in sil_js, "participant delivery readiness is visible")
require('declaration' in sil_js and 'true, factual record' in sil_js, "choice records require worker declaration")
require('sil-record.html?id=' in sil_js and 'evidenceUrl(recordId)' in sil_js, "completed SIL evidence uses a normal mobile-safe link")
require('currentLevel!=="aal2"' in sil_record_js, "evidence viewer requires MFA")
require('.eq("organisation_id",profile.organisation_id)' in sil_record_js, "evidence viewer is scoped to the worker organisation")
require('record_access_event' in sil_record_js and 'dedicated_evidence_page' in sil_record_js, "evidence viewer records a compliance read event")
require('textContent' in sil_record_js and 'innerHTML' not in sil_record_js, "evidence viewer renders record values without HTML injection")
require('event.request.mode==="navigate"' in service_worker, "service worker never stores navigation HTML")
require('"/set-password"' in service_worker, "service worker excludes the canonical setup route")
require('"/sil-record"' in service_worker, "service worker excludes the secure evidence route")
require('/set-password.html\n  Cache-Control: no-store, max-age=0' in headers, "setup page is marked no-store")
require('/set-password\n  Cache-Control: no-store, max-age=0' in headers, "canonical setup route is marked no-store")
require('/sil-record.html\n  Cache-Control: no-store, max-age=0' in headers, "evidence page is marked no-store")
require('/sil-record\n  Cache-Control: no-store, max-age=0' in headers, "canonical evidence route is marked no-store")

# No browser-side privileged secrets or public Drive links.
browser_paths = [
    "index.html", "app.js", "operations.js", "staff-management.js",
    "set-password.html", "set-password.js", "medication-prn-fix.js",
    "participant-edit-controls.js", "portal-complaints.js", "client-onboarding.js", "sil.html", "sil.js", "sil-record.html", "sil-record.js", "config.js",
]
for path in browser_paths:
    source = text(path)
    require("SUPABASE_SERVICE_ROLE_KEY" not in source, f"{path} has no service-role key reference")
    require("service_role" not in source.lower(), f"{path} has no service-role credential")
    require("docs.google.com" not in source, f"{path} has no Google Drive runtime link")

# Portal least privilege.
app = text("app.js")
require('related_sil_record_id' in app and 'sil-record.html?id=' in app, "choice timeline entries open their audited SIL form")
require('florence:sil-record-return' in app and 'target.origin===location.origin' in app and 'sil-record(?:\\.html)?$' in app, "sign-in restores only a same-origin canonical or HTML evidence link")
portal_care_plan = text("portal-care-plan.js")
require('related_sil_record_id' in portal_care_plan and 'sil-record.html?id=' in portal_care_plan, "participant history links to completed choice evidence")
roster_30_day = text("roster-30-day.js")
require('data-response="Accepted"' in roster_30_day and 'data-response="Declined"' in roster_30_day, "30-day roster offers accept and decline controls")
require('shift.assigned_staff_id===B().profile.id' in roster_30_day and 'shift.response==="Pending"' in roster_30_day, "30-day roster responses are limited to the signed-in worker's pending shifts")
require('data-roster-clock-in="${shift.id}"' in roster_30_day and 'data-roster-clock-out="${shift.id}"' in roster_30_day, "accepted personal shifts offer roster clock-in and clock-out controls")
require('secureRpc("respond_to_shift",{p_shift_id:b.dataset.shiftResponse,p_response:b.dataset.response})' in app, "roster response controls use the secured shift-response function")
require('data-roster-days="30"' in roster_30_day and "__roster30Observer" in roster_30_day, "30-day roster stays mounted after a secure shift response refresh")
index_parser = IdParser()
index_parser.feed(index)
index_ids = set(index_parser.ids)
direct_handler_ids = set(re.findall(r'\$\("#([A-Za-z0-9_-]+)"\)\.(?:onclick|onsubmit|onchange)\s*=', app))
missing_handler_ids = sorted(direct_handler_ids - index_ids)
require(not missing_handler_ids or modern_index, f"app.js direct event handlers have matching index elements: {missing_handler_ids}")
require('addEventListener("DOMContentLoaded",()=>void boot(),{once:true})' in app, "app.js reaches the authenticated boot entrypoint")
require(
    ('data-med-tab="Regular"' in index and '<script src="app.js?v=' in index and index.index('data-med-tab="Regular"') < index.index('<script src="app.js?v='))
    or (modern_index and "Regular" in modern_app),
    "Regular medication tab exists before app handlers initialise",
)
require(
    ('id="pin-status"' in index and 'aria-live="assertive"' in index)
    or (modern_index and ('role:"alert"' in modern_app or 'role:`alert`' in modern_app)),
    "medication signing errors remain visible inside the modal",
)
require(
    'id="pin-submit" type="submit"' in index
    or (modern_index and "Sign and save MAR" in modern_app),
    "medication signing has an explicit submit control",
)
require('submit.textContent="Signing and saving…"' in app, "medication signing shows an in-progress state")
require('Florence did not receive a signing response' in app, "medication signing cannot wait silently forever")
require('florence:medication-sign-open' in app, "medication signing identifies the exact selected medication")
prn_fix = text("medication-prn-fix.js")
require('showError(error.message)' in prn_fix, "PRN validation errors are displayed inside the signing modal")
require('notes.dataset.prnAssessment' in prn_fix, "PRN retries do not duplicate the structured assessment")
require('input[type="checkbox"]' in prn_fix and 'width:24px!important' in prn_fix, "PRN observed-sign checkboxes stay compact on mobile")
require('$$("[data-round-status]",$("#med-content")).forEach' in app, "MAR round outcome buttons receive direct mobile-safe handlers")
require('if(!legacyInvoiceList)return' in app, "legacy invoice renderer does not overwrite the smart invoicing workspace")
require('ensureReady' in app, "authenticated bridge can recover a mobile session before invoicing")
require('secureRpc("record_progress_note"' in app, "progress notes validate and refresh the signed-in session before RPC")
require('localStorage.setItem(ACTIVITY_KEY,String(Date.now()))' in app, "a successful new login resets the inactivity clock")
require('localStorage.removeItem(ACTIVITY_KEY)' in app, "sign-out clears the previous inactivity timestamp")
require('permission denied for function|jwt expired|invalid jwt|not authenticated' in app, "sensitive RPCs retry once after a secure session refresh")
invoice_workspace = text("invoicing-workspace.js")
require('view.dataset.smartInvoicingInstalled==="true"' in invoice_workspace, "smart invoicing installs only once")
require('await bridge.ensureReady?.()||bridge.profile' in invoice_workspace, "smart invoicing validates the current supervisor organisation")
require('b.profile.organisation_id' not in invoice_workspace, "smart invoicing never dereferences a missing bridge profile")
for marker in ['invoicing-workspace.js?v=20260813-multi-client-1', 'invoice-menu-fix.js?v=20260804-pricing-1']:
    require(marker in config, f"config owns one controlled invoice runtime loader for {marker}")
client_onboarding = text("client-onboarding.js")
contains(
    "client-onboarding.js",
    'create_participant_with_services',
    'set_participant_service_scopes',
    'Domestic duties only.',
    'No participant currently has Medication support',
    'Onboarding readiness',
)
require('participant_service_scopes' in app_js, "participant service scopes are included in encrypted organisation archives")
require('service_type:line.service_type' in invoice_workspace and 'shift_id:line.shift_id||null' in invoice_workspace, "invoice lines carry the approved service and linked shift into database enforcement")
require('florence-multi-client-service-scope.sql' in quality_gate and 'florence_multi_client_service_scope_smoke_test.sql' in quality_gate, "quality gate applies and tests the multi-client service-scope migration")
require("withRuntimeFixes" not in service_worker, "service worker does not rewrite app HTML or duplicate runtime scripts")
contains(
    "app.js",
    'if(isPortalUser()&&v!=="portal")v="portal"',
    'element.dataset.view!=="portal"',
    'if(isPortalUser())showView("portal")',
    '$$(".staff-only").forEach',
)
require('roleLabels={supervisor:"Supervisor workspace",staff:"Support worker workspace",family:"Family portal",client:"Client portal"}' in app, "all four account roles remain supported")
require('navigator.serviceWorker.getRegistration()' in config, "first-login push setup checks registration without waiting indefinitely")
current_state = re.search(r'async function currentState\(\).*?\n  \}', config, re.S)
require(current_state is not None and 'await navigator.serviceWorker.ready' not in current_state.group(0), "push status never blocks on service-worker readiness")
require('function startPushPanel(){' in config and 'setInterval(()=>{attempts++;void renderPushPanel' not in config, "push setup uses one bounded non-overlapping retry loop")

# One-time setup-code account activation.
staff_management = text("staff-management.js")
contains(
    "staff-management.js",
    'new URL("set-password.html",location.href)',
    'invokeSetup({action:"invite"',
    'invokeSetup({action:"generate-code"',
    "showSetupCode(result)",
    "Fresh one-time setup code created",
)
contains(
    "set-password.js",
    '/functions/v1/account-setup',
    'body:JSON.stringify({email,code,password})',
    'credentials:"omit"',
    'cache:"no-store"',
)
require('minlength="10"' in set_password_html, "setup requires at least ten password characters")
require('pattern="[0-9]{8}"' in set_password_html, "setup requires an eight-digit one-time code")
require('autocomplete="one-time-code"' in set_password_html, "setup code input uses one-time-code semantics")
require("window.supabase" not in set_password, "setup page does not restore a browser auth session")

# Server-controlled time clock.
operations = text("operations.js")
contains(
    "operations.js",
    'db.rpc("clock_in_timesheet"',
    'db.rpc("clock_out_timesheet"',
    "t.work_type||", "t.clock_in_notes", "t.clock_out_notes",
    '"Administration / office work"',
)
require('clock_in:new Date().toISOString()' not in operations, "browser no longer supplies clock-in timestamp")
require('clock_out:new Date().toISOString()' not in operations, "browser no longer supplies clock-out timestamp")
require('.from("timesheets").insert' not in operations, "browser cannot directly insert a clock-in row")
require('await loadTimeClock()' in operations and 'await loadOperations()' not in operations.split('window.addEventListener("florence:ready"', 1)[1].split(');', 1)[0], "main-page startup loads only the worker clock status")
require('["safety","workforce","outcomes","governance"]' in operations, "operational archives load only when their view is opened")
require('if(q("#participants-view.active"))' in portal_care_plan, "participant detail queries wait until the participant view is opened")
for path, marker in [
    ("core-ui-fixes-v2.js", "setInterval(ensure,750)"),
    ("core-ui-fixes-v3.js", "setInterval(startControls,500)"),
    ("participant-edit-controls.js", "setInterval(start,400)"),
    ("participant-file.js", "setInterval(start,1000)"),
    ("secure-document-careplan-fix.js", "setInterval(start,1200)"),
]:
    require(marker not in text(path), f"{path} has no permanent high-frequency DOM polling")

# SIL operational records are server-side, MFA-protected and audited.
sil = text("sil.js")
contains(
    "sil.js", 'db.from("sil_records")', 'db.from("sil_provider_profiles")',
    'data-archive-record', 'record_access_event', 'currentLevel!=="aal2"',
    'Secure Supabase records',
)
require("localStorage.getItem" not in sil, "SIL records are not read from localStorage")
require("localStorage.setItem" not in sil, "SIL records are not written to localStorage")
require("data-delete" not in sil, "SIL records are archived rather than hard-deleted")
require('workerCreateRecordTypes=new Set(["visitor","choice","handover","domesticChecklist"])' in sil, "worker SIL write scope is explicitly limited")
catalogue = text("audit-document-catalogue.js")
controlled_count = len(re.findall(r'^ \{key:"(?:core|sil)-', catalogue, re.M))
evidence_count = len(re.findall(r'^ \{module:"(?:Core|Module 5A)",area:', catalogue, re.M))
require(controlled_count == 97, f"controlled private library has 97 unique requirements representing 98 sources (found {controlled_count})")
require(evidence_count == 29, f"audit evidence matrix has 29 live-evidence checks (found {evidence_count})")
contains(
    "audit-document-catalogue.js",
    'sourceReferenceCount!==98',
    'title:"SIL Tenancy, Housing and Support Arrangements Policy"',
    'title:"SIL House Safeguarding Assessment"',
    'title:"Feedback and Complaints Register"',
    'title:"Current insurance certificates"',
)
contains(
    "sil.js",
    "approve_controlled_document",
    'db.from("audit_evidence_checks")',
    "Draft — needs approval",
)

choice_timeline = text("florence-choice-evidence-timeline-fix.sql")
for marker in [
    "related_sil_record_id", "sync_sil_choice_to_timeline",
    "sil_choice_timeline_sync", "PASS_CHOICE_EVIDENCE_TIMELINE",
    "set search_path=public,pg_temp",
]:
    require(marker in choice_timeline, f"choice timeline SQL contains {marker!r}")

portal_complaints_sql = text("florence-portal-complaints-upgrade.sql")
for marker in [
    "alter type public.portal_thread_type add value if not exists 'Complaint or feedback'",
    "portal_thread_id uuid",
    "create or replace function public.submit_portal_complaint",
    "create or replace function public.reply_to_portal_complaint",
    "create trigger complaints_notify",
    "perform public.require_verified_mfa()",
    "thread_record.created_by=(select auth.uid())",
    "thread_record.thread_type<>'Complaint or feedback'",
    "Supervisor replied to your complaint",
    "Further review requested",
    "PORTAL_COMPLAINTS_READY",
]:
    require(marker in portal_complaints_sql, f"portal complaints SQL contains {marker!r}")
quality_gate = text(".github/workflows/florence-quality-gate.yml")
require('florence-portal-complaints-upgrade.sql' in quality_gate and 'florence_portal_complaints_smoke_test.sql' in quality_gate, "quality gate applies and exercises the portal complaints migration")

# Database hardening, RLS, cleanup and verification.
final_sql = text("florence-final-readiness-upgrade.sql")
for marker in [
    "create or replace function public.clock_in_timesheet",
    "create or replace function public.clock_out_timesheet",
    "timesheets_one_open_per_worker",
    "create table if not exists public.sil_records",
    "create table if not exists public.sil_provider_profiles",
    "create policy sil_records_mfa_required",
    "create trigger sil_records_audit",
    "public.current_role() in('family','client') and id=public.current_participant_id()",
    "lower(btrim(full_name))='mary jane'",
    "lower(btrim(medication_name))='sifrol'",
    "PASS_FOR_LIVE_UAT",
]:
    require(marker in final_sql, f"final readiness SQL contains {marker!r}")
require("drop policy if exists timesheets_own_insert" in final_sql, "direct worker timesheet insert policy is removed")
require("drop policy if exists timesheets_own_update" in final_sql, "direct worker timesheet update policy is removed")

hardening = text("florence-production-hardening-upgrade.sql")
for marker in [
    "create or replace function public.require_verified_mfa",
    "drop policy if exists mar_staff_insert",
    "drop policy if exists notes_staff_insert",
    "create or replace function public.record_medication_administration",
    "create or replace function public.record_progress_note",
    "create or replace function public.claim_open_shift",
    "create or replace function public.respond_to_shift",
]:
    require(marker in hardening, f"production hardening contains {marker!r}")

controlled_access = text("florence-controlled-library-access-upgrade.sql")
contains(
    "florence-controlled-library-access-upgrade.sql",
    "public.is_worker_controlled_document",
    "florence_storage_read",
    "coalesce(auth.jwt()->>'aal','aal1')='aal2'",
)

complete_library = text("florence-complete-audit-library-upgrade.sql")
for marker in [
    "create table if not exists public.audit_evidence_checks",
    "create or replace function public.approve_controlled_document",
    "public.controlled_document_approval_tickets",
    "create or replace function public.enforce_controlled_document_lifecycle",
    "lifecycle_status='Approved'",
    "review_date>=current_date",
    "COMPLETE_AUDIT_LIBRARY_READY",
]:
    require(marker in complete_library, f"complete audit-library SQL contains {marker!r}")

complete_library_hardening = text("florence-complete-audit-library-security-hardening.sql")
for marker in [
    "revoke all privileges on table public.audit_evidence_checks from public,anon",
    "revoke all privileges on table public.controlled_document_approval_tickets",
    "revoke all on function public.enforce_controlled_document_lifecycle()",
    "coalesce((select auth.jwt())->>'aal','aal1')='aal2'",
    "audit_evidence_checks_reviewed_by_idx",
    "controlled_document_approval_tickets_document_idx",
    "COMPLETE_AUDIT_LIBRARY_HARDENED",
]:
    require(marker in complete_library_hardening, f"audit-library hardening contains {marker!r}")

# Privileged Edge Functions remain server-side behind origin, MFA and supervisor checks.
for path in ["supabase/functions/staff-management/index.ts", "supabase/functions/xero-connect/index.ts"]:
    source = text(path)
    require('env("SUPABASE_SERVICE_ROLE_KEY")' in source, f"{path} reads service role only from an Edge Function secret")
    require('claims.aal!=="aal2"' in source, f"{path} requires MFA/AAL2")
    require("originAllowed(req)" in source, f"{path} validates request origin")
    require('profile.role!=="supervisor"' in source or 'profile.role!="supervisor"' in source, f"{path} requires supervisor role")

deputy_function = text("supabase/functions/deputy-connect/index.ts")
require('claims.aal!=="aal2"' in deputy_function, "Deputy requires MFA/AAL2")
require("originAllowed(req)" in deputy_function, "Deputy validates request origin")
for path in ["supabase/functions/bright-worker/index.ts", "supabase/functions/bright-service/index.ts"]:
    source = text(path)
    require("legacy endpoint has been retired" in source.lower(), f"{path} retires legacy privileged access")
    require("SUPABASE_SERVICE_ROLE_KEY" not in source, f"{path} has no service-role access")

# Repository does not contain known runtime fake records.
for path in ["app.js", "operations.js", "sil.js", "index.html", "sil.html"]:
    source = text(path).lower()
    require("mary jane" not in source, f"{path} has no hardcoded Mary Jane test participant")
    require("sifrol" not in source, f"{path} has no hardcoded Sifrol test medication")

# Cloudflare SIL routing and private-document regression controls.
require('new URL(location.href).searchParams.get("return")' in app, "main app honours return-to-SIL after MFA")
require('showSilStartupError(error)' in sil, "SIL startup failures remain visible")
require('await db.auth.refreshSession()' in sil, "SIL refreshes session before checking MFA")
require('window.open("about:blank","_blank")' in sil, "private PDF opens a browser target before signing")
private_document_match = re.search(r'async function openPrivateDocument.*?async function sha256Hex', sil, re.S)
require(private_document_match is not None, "private PDF function is present")
if private_document_match:
    require('.catch(()=>{})' not in private_document_match.group(0), "private PDF audit avoids catch on a PostgREST builder")
require('sil-rpc-audit-fix.js' not in sil_html, "SIL no longer depends on obsolete RPC patch")
require(not (ROOT / "sil-rpc-audit-fix.js").exists(), "obsolete SIL RPC patch file is removed")

# Schedule 8 dual PIN and timeline controls.
s8_upgrade = text("florence-s8-dual-signoff-timeline-upgrade.sql")
for marker in [
    "S8_DUAL_SIGNOFF_TIMELINE_READY", "p_witness_pin text",
    "witness_pin_verified", "record_controlled_drug_transaction",
    "sync_mar_entry_to_timeline", "sync_progress_note_to_timeline",
    "related_mar_entry_id", "related_progress_note_id",
    "drop policy if exists controlled_drug_register_staff_insert",
    "revoke insert,update,delete on public.controlled_drug_register from authenticated",
]:
    require(marker in s8_upgrade, f"S8/timeline upgrade contains {marker!r}")
require(
    ('id="s8-witness-id"' in index and 'id="s8-witness-pin"' in index)
    or (modern_index and "Choose second worker" in modern_app and "Witness PIN" in modern_app),
    "S8 MAR collects second worker and PIN",
)
require('p_witness_id:witnessId' in app and 'p_witness_pin:witnessPin' in app, "S8 MAR sends witness fields to RPC")
require('record_controlled_drug_transaction' in operations, "manual S8 stock uses dual-PIN RPC")
require('.from("controlled_drug_register").insert' not in operations, "browser cannot directly insert S8 rows")

# Participant controls have one canonical owner and accessible PRN pain assessment remains published.
participant_controls = text("core-ui-fixes-v3.js")
contains("core-ui-fixes-v3.js", "Edit participant", "Approve care plan", "edit-participant-details")
require('participant-edit-controls.js' not in config and 'participant-file.js' not in config, "legacy participant observers are not loaded")
require("Participant editing is owned by core-ui-fixes-v3" in text("core-ui-fixes-v2.js"), "legacy core participant observer stays inert")
require('timeZone:BUSINESS_TIME_ZONE' in app and 'brisbaneLocalToIso' in app, "business timestamps display and save in Australia/Brisbane")
require('occurred_at:B().brisbaneLocalToIso(v.occurred_at)' in operations, "incident forms convert Brisbane wall-clock time to UTC")
prn = text("medication-prn-fix.js")
for marker in [
    "Easy-read pain assessment", "Show me how much it hurts", "A little pain",
    "Medium pain", "Worst pain", "prn-pain-location",
    "prn-pain-communication", "Observed signs", "PRN pain assessment:",
]:
    require(marker in prn, f"PRN pain assessment contains {marker!r}")
require('form.addEventListener("submit"' in prn, "PRN pain assessment is included before MAR signing")
require('notes.value=' in prn, "PRN pain assessment is retained in signed MAR notes")

print(f"Florence static audit: {len(PASSES)} checks passed")
if FAILURES:
    print(f"Florence static audit: {len(FAILURES)} checks FAILED", file=sys.stderr)
    for failure in FAILURES:
        print(f" - {failure}", file=sys.stderr)
    raise SystemExit(1)

print("Florence static audit result: PASS_FOR_LIVE_UAT")
