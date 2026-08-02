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
    if condition:
        PASSES.append(message)
    else:
        FAILURES.append(message)


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


# Required application and migration files.
required_files = [
    "index.html",
    "styles.css",
    "config.js",
    "app.js",
    "operations.js",
    "staff-management.js",
    "set-password.html",
    "set-password.js",
    "sil.html",
    "sil.css",
    "sil.js",
    "service-worker.js",
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

# HTML structure and dependency pinning.
for path in ["index.html", "set-password.html", "sil.html"]:
    parser = IdParser()
    parser.feed(text(path))
    duplicates = {key: value for key, value in Counter(parser.ids).items() if value > 1}
    require(not duplicates, f"{path} contains no duplicate IDs: {duplicates}")
    require("@supabase/supabase-js@2.106.2" in text(path), f"{path} pins Supabase JS 2.106.2")

index = text("index.html")
set_password_html = text("set-password.html")
set_password = text("set-password.js")
sil_html = text("sil.html")
service_worker = text("service-worker.js")
headers = text("_headers")
require('app.js?v=20260802-1' in index, "index loads final app asset")
require('operations.js?v=20260802-1' in index, "index loads final operations asset")
require('sil.js?v=20260801-4' in sil_html, "SIL page loads final SIL asset")
require('set-password.js?v=20260802-1' in set_password_html, "password page loads its controlled asset")
require('florence-shell-20260802-2' in service_worker, "service worker uses final cache namespace")
for marker in ['app.js?v=20260802-1', 'operations.js?v=20260802-1', 'sil.js?v=20260801-4']:
    require(marker in service_worker, f"service worker caches {marker}")
require('url.pathname.endsWith("/set-password.html")' in service_worker, "service worker never stores password-link HTML")
require('/set-password.html\n  Cache-Control: no-store, max-age=0' in headers, "password setup page is marked no-store")

# No browser-side secrets or old public Drive links.
browser_paths = ["index.html", "app.js", "operations.js", "staff-management.js", "set-password.html", "set-password.js", "sil.html", "sil.js", "config.js"]
for path in browser_paths:
    source = text(path)
    require("SUPABASE_SERVICE_ROLE_KEY" not in source, f"{path} has no service-role key reference")
    require("service_role" not in source.lower(), f"{path} has no service-role credential")
    require("docs.google.com" not in source, f"{path} has no Google Drive runtime link")

# Portal least privilege.
app = text("app.js")
contains(
    "app.js",
    'if(isPortalUser()&&v!=="portal")v="portal"',
    'element.dataset.view!=="portal"',
    'if(isPortalUser())showView("portal")',
    '$$(".staff-only").forEach',
)
require('roleLabels={supervisor:"Supervisor workspace",staff:"Support worker workspace",family:"Family portal",client:"Client portal"}' in app, "all four account roles remain supported")

# Invitations and password recovery must finish with an actual password.
staff_management = text("staff-management.js")
contains(
    "staff-management.js",
    'new URL("set-password.html",location.href)',
    'resetPasswordForEmail(email,{redirectTo:passwordSetupUrl()})',
    'resetPasswordForEmail(person.email,{redirectTo:passwordSetupUrl()})',
    "Fresh password setup email sent",
)
contains(
    "set-password.js",
    "waitForSession",
    "db.auth.updateUser({password})",
    'db.auth.signOut({scope:"local"})',
    "clearSensitiveUrl",
)
require('minlength="10"' in set_password_html, "password setup requires at least ten characters in the browser")
require("location.hash" in set_password, "password setup reads invite and recovery URL fragments before clearing them")
require("verifiedSession" in set_password, "password setup requires a verified one-time authentication session")

# Server-controlled time clock.
operations = text("operations.js")
contains(
    "operations.js",
    'db.rpc("clock_in_timesheet"',
    'db.rpc("clock_out_timesheet"',
    "t.work_type||",
    "t.clock_in_notes",
    "t.clock_out_notes",
    '"Administration / office work"',
)
require('clock_in:new Date().toISOString()' not in operations, "browser no longer supplies clock-in timestamp")
require('clock_out:new Date().toISOString()' not in operations, "browser no longer supplies clock-out timestamp")
require('.from("timesheets").insert' not in operations, "browser cannot directly insert a clock-in row")

# SIL operational records must be server-side, MFA-protected and audited.
sil = text("sil.js")
contains(
    "sil.js",
    'db.from("sil_records")',
    'db.from("sil_provider_profiles")',
    'data-archive-record',
    'record_access_event',
    'currentLevel!=="aal2"',
    'Secure Supabase records',
)
require("localStorage.getItem" not in sil, "SIL records are not read from localStorage")
require("localStorage.setItem" not in sil, "SIL records are not written to localStorage")
require('KEY="florence-sil-v1"' not in sil, "legacy SIL localStorage state key is removed")
require("data-delete" not in sil, "SIL records are archived rather than hard-deleted in the browser")
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

# Privileged Edge Functions: service role remains server-side behind origin, MFA and supervisor checks.
for path in ["supabase/functions/staff-management/index.ts", "supabase/functions/xero-connect/index.ts"]:
    source = text(path)
    require('env("SUPABASE_SERVICE_ROLE_KEY")' in source, f"{path} reads the service role only from an Edge Function secret")
    require('claims.aal!=="aal2"' in source, f"{path} requires MFA/AAL2")
    require("originAllowed(req)" in source, f"{path} validates request origin")
    require('profile.role!=="supervisor"' in source or 'profile.role!="supervisor"' in source, f"{path} requires supervisor role")

# Repository must not contain known runtime fake records.
for path in ["app.js", "operations.js", "sil.js", "index.html", "sil.html"]:
    source = text(path).lower()
    require("mary jane" not in source, f"{path} has no hardcoded Mary Jane test participant")
    require("sifrol" not in source, f"{path} has no hardcoded Sifrol test medication")

# Cloudflare SIL routing and private-document regression controls.
require('new URL(location.href).searchParams.get("return")' in app, "main app honours return-to-SIL after MFA")
require('showSilStartupError(error)' in sil, "SIL startup failures remain visible instead of silently redirecting Home")
require('await db.auth.refreshSession()' in sil, "SIL refreshes the session before checking MFA assurance")
require('window.open("about:blank","_blank")' in sil, "private PDF opens a browser target before asynchronous signing")
private_document_match = re.search(r'async function openPrivateDocument.*?async function sha256Hex', sil, re.S)
require(private_document_match is not None, "private PDF function is present")
if private_document_match:
    require('.catch(()=>{})' not in private_document_match.group(0), "private PDF audit does not call catch on a PostgREST builder")
require('sil-rpc-audit-fix.js' not in sil_html, "SIL no longer depends on the RPC monkey-patch")
require(not (ROOT / "sil-rpc-audit-fix.js").exists(), "obsolete SIL RPC monkey-patch file is removed")

# Schedule 8 dual PIN and automatic timeline controls.
s8_upgrade = text("florence-s8-dual-signoff-timeline-upgrade.sql")
for marker in [
    "S8_DUAL_SIGNOFF_TIMELINE_READY",
    "p_witness_pin text",
    "witness_pin_verified",
    "record_controlled_drug_transaction",
    "sync_mar_entry_to_timeline",
    "sync_progress_note_to_timeline",
    "related_mar_entry_id",
    "related_progress_note_id",
    "drop policy if exists controlled_drug_register_staff_insert",
    "revoke insert,update,delete on public.controlled_drug_register from authenticated",
]:
    require(marker in s8_upgrade, f"S8/timeline upgrade contains {marker!r}")
require('id="s8-witness-id"' in index and 'id="s8-witness-pin"' in index, "S8 MAR dialog collects the second worker and private PIN")
require('p_witness_id:witnessId' in app and 'p_witness_pin:witnessPin' in app, "S8 MAR sends both witness fields to the controlled RPC")
require('record_controlled_drug_transaction' in operations, "manual S8 stock workflow uses the dual-PIN RPC")
require('.from("controlled_drug_register").insert' not in operations, "browser cannot directly insert Schedule 8 register rows")

print(f"Florence static audit: {len(PASSES)} checks passed")
if FAILURES:
    print(f"Florence static audit: {len(FAILURES)} checks FAILED", file=sys.stderr)
    for failure in FAILURES:
        print(f" - {failure}", file=sys.stderr)
    raise SystemExit(1)

print("Florence static audit result: PASS_FOR_LIVE_UAT")
