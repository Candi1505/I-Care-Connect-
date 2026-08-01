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
    "app.js",
    "operations.js",
    "staff-management.js",
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
]
for path in required_files:
    require((ROOT / path).exists(), f"required file exists: {path}")

# HTML structure and dependency pinning.
for path in ["index.html", "sil.html"]:
    parser = IdParser()
    parser.feed(text(path))
    duplicates = {key: value for key, value in Counter(parser.ids).items() if value > 1}
    require(not duplicates, f"{path} contains no duplicate IDs: {duplicates}")
    require("@supabase/supabase-js@2.106.2" in text(path), f"{path} pins Supabase JS 2.106.2")

index = text("index.html")
sil_html = text("sil.html")
service_worker = text("service-worker.js")
require('app.js?v=20260801-5' in index, "index loads final app asset")
require('operations.js?v=20260801-2' in index, "index loads final operations asset")
require('sil.js?v=20260801-4' in sil_html, "SIL page loads final SIL asset")
require('florence-shell-20260801-6' in service_worker, "service worker uses final cache namespace")
for marker in ['app.js?v=20260801-5', 'operations.js?v=20260801-2', 'sil.js?v=20260801-4']:
    require(marker in service_worker, f"service worker caches {marker}")

# No browser-side secrets or old public Drive links.
browser_paths = ["index.html", "app.js", "operations.js", "staff-management.js", "sil.html", "sil.js", "config.js"]
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

print(f"Florence static audit: {len(PASSES)} checks passed")
if FAILURES:
    print(f"Florence static audit: {len(FAILURES)} checks FAILED", file=sys.stderr)
    for failure in FAILURES:
        print(f" - {failure}", file=sys.stderr)
    raise SystemExit(1)

print("Florence static audit result: PASS_FOR_LIVE_UAT")
