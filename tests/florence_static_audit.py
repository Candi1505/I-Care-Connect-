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
    "medication-prn-fix.js", "participant-edit-controls.js",
    "sil.html", "sil.css", "sil.js", "service-worker.js",
    "supabase/functions/staff-management/index.ts",
    "supabase/functions/xero-connect/index.ts",
    "florence-production-hardening-upgrade.sql",
    "florence-controlled-library-access-upgrade.sql",
    "florence-controlled-library-upload-hotfix.sql",
    "florence-final-readiness-upgrade.sql",
    "florence-s8-dual-signoff-timeline-upgrade.sql",
]
for path in required_files:
    require((ROOT / path).exists(), f"required file exists: {path}")

# HTML structure and controlled dependencies.
for path in ["index.html", "set-password.html", "sil.html"]:
    parser = IdParser()
    parser.feed(text(path))
    duplicates = {key: value for key, value in Counter(parser.ids).items() if value > 1}
    require(not duplicates, f"{path} contains no duplicate IDs: {duplicates}")

index = text("index.html")
set_password_html = text("set-password.html")
set_password = text("set-password.js")
sil_html = text("sil.html")
service_worker = text("service-worker.js")
headers = text("_headers")
config = text("config.js")

require("@supabase/supabase-js@2.106.2" in index, "index pins Supabase JS 2.106.2")
require("@supabase/supabase-js@2.106.2" in sil_html, "sil.html pins Supabase JS 2.106.2")
require("@supabase/supabase-js" not in set_password_html, "setup page does not create a browser Supabase session")
require('app.js?v=20260804-invoice-session-1' in index, "index loads invoice-session-safe app asset")
require('config.js?v=20260804-pricing-1' in index, "index loads current invoice pricing runtime configuration")
require('operations.js?v=20260802-1' in index, "index loads final operations asset")
require('sil.js?v=20260801-4' in sil_html, "SIL page loads final SIL asset")
require('set-password.js?v=20260802-2' in set_password_html, "setup page loads its controlled asset")
require('florence-shell-20260804-pricing-1' in service_worker, "service worker uses current cache namespace")
for marker in ['config.js?v=20260804-pricing-1', 'app.js?v=20260804-invoice-session-1', 'operations.js?v=20260802-1', 'sil.js?v=20260801-4']:
    require(marker in service_worker, f"service worker caches {marker}")
require('url.pathname.endsWith("/set-password.html")' in service_worker, "service worker never stores setup-link HTML")
require('/set-password.html\n  Cache-Control: no-store, max-age=0' in headers, "setup page is marked no-store")

# No browser-side privileged secrets or public Drive links.
browser_paths = [
    "index.html", "app.js", "operations.js", "staff-management.js",
    "set-password.html", "set-password.js", "medication-prn-fix.js",
    "participant-edit-controls.js", "sil.html", "sil.js", "config.js",
]
for path in browser_paths:
    source = text(path)
    require("SUPABASE_SERVICE_ROLE_KEY" not in source, f"{path} has no service-role key reference")
    require("service_role" not in source.lower(), f"{path} has no service-role credential")
    require("docs.google.com" not in source, f"{path} has no Google Drive runtime link")

# Portal least privilege.
app = text("app.js")
index_parser = IdParser()
index_parser.feed(index)
index_ids = set(index_parser.ids)
direct_handler_ids = set(re.findall(r'\$\("#([A-Za-z0-9_-]+)"\)\.(?:onclick|onsubmit|onchange)\s*=', app))
missing_handler_ids = sorted(direct_handler_ids - index_ids)
require(not missing_handler_ids, f"app.js direct event handlers have matching index elements: {missing_handler_ids}")
require('addEventListener("DOMContentLoaded",()=>void boot(),{once:true})' in app, "app.js reaches the authenticated boot entrypoint")
require('data-med-tab="Regular"' in index and index.index('data-med-tab="Regular"') < index.index('app.js?v=20260804-invoice-session-1'), "Regular medication tab exists before app handlers initialise")
require('$$("[data-round-status]",$("#med-content")).forEach' in app, "MAR round outcome buttons receive direct mobile-safe handlers")
require('if(!legacyInvoiceList)return' in app, "legacy invoice renderer does not overwrite the smart invoicing workspace")
require('ensureReady' in app, "authenticated bridge can recover a mobile session before invoicing")
invoice_workspace = text("invoicing-workspace.js")
require('view.dataset.smartInvoicingInstalled==="true"' in invoice_workspace, "smart invoicing installs only once")
require('await bridge.ensureReady?.()||bridge.profile' in invoice_workspace, "smart invoicing validates the current supervisor organisation")
require('b.profile.organisation_id' not in invoice_workspace, "smart invoicing never dereferences a missing bridge profile")
for marker in ['invoicing-workspace.js?v=20260804-pricing-1', 'invoice-menu-fix.js?v=20260804-pricing-1']:
    require(marker in config, f"config owns one controlled invoice runtime loader for {marker}")
require("withRuntimeFixes" not in service_worker, "service worker does not rewrite app HTML or duplicate runtime scripts")
contains(
    "app.js",
    'if(isPortalUser()&&v!=="portal")v="portal"',
    'element.dataset.view!=="portal"',
    'if(isPortalUser())showView("portal")',
    '$$(".staff-only").forEach',
)
require('roleLabels={supervisor:"Supervisor workspace",staff:"Support worker workspace",family:"Family portal",client:"Client portal"}' in app, "all four account roles remain supported")

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
require('workerCreateRecordTypes=new Set(["visitor","choice","handover"])' in sil, "worker SIL write scope is explicitly limited")
controlled_match = re.search(r"const controlledDocuments=\[(.*?)\n\];\nlet privateDocuments", sil, re.S)
controlled_count = len(re.findall(r'^\["', controlled_match.group(1), re.M)) if controlled_match else 0
require(controlled_count == 44, f"controlled private library manifest has 44 documents (found {controlled_count})")

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

# Privileged Edge Functions remain server-side behind origin, MFA and supervisor checks.
for path in ["supabase/functions/staff-management/index.ts", "supabase/functions/xero-connect/index.ts"]:
    source = text(path)
    require('env("SUPABASE_SERVICE_ROLE_KEY")' in source, f"{path} reads service role only from an Edge Function secret")
    require('claims.aal!=="aal2"' in source, f"{path} requires MFA/AAL2")
    require("originAllowed(req)" in source, f"{path} validates request origin")
    require('profile.role!=="supervisor"' in source or 'profile.role!="supervisor"' in source, f"{path} requires supervisor role")

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
require('id="s8-witness-id"' in index and 'id="s8-witness-pin"' in index, "S8 MAR collects second worker and PIN")
require('p_witness_id:witnessId' in app and 'p_witness_pin:witnessPin' in app, "S8 MAR sends witness fields to RPC")
require('record_controlled_drug_transaction' in operations, "manual S8 stock uses dual-PIN RPC")
require('.from("controlled_drug_register").insert' not in operations, "browser cannot directly insert S8 rows")

# Participant controls and accessible PRN pain assessment remain published.
participant_controls = text("participant-edit-controls.js")
contains("participant-edit-controls.js", "Edit participant", "Approve care plan")
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
