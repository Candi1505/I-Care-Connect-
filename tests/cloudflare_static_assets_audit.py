from __future__ import annotations

import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_ASSETS = {
    "index.html", "styles.css", "config.js", "app.js", "operations.js",
    "staff-management.js", "setup-code-display.js", "portal-participant-label.js",
    "live-refresh-controls.js", "notification-navigation.js",
    "push-notifications.js", "portal-care-plan.js", "portal-complaints.js", "participant-edit-controls.js",
    "participant-file.js", "secure-document-careplan-fix.js",
    "medication-prn-fix.js", "regular-medication-tab.js", "roster-30-day.js",
    "deputy-integration.js", "deputy-permanent-token-ui-fix.js",
    "invoicing-workspace.js", "invoice-menu-fix.js", "florence-readiness-controls.js",
    "remote-s8-verification.js", "core-ui-fixes-v2.js", "core-ui-fixes-v3.js",
    "set-password.html", "set-password.js",
    "sil.html", "sil-record.html", "sil.css", "audit-document-catalogue.js", "sil.js", "sil-record.js", "service-worker.js", "manifest.webmanifest",
    "florence-icon.svg", "florence-icon-192.png", "florence-icon-512.png",
    "_headers", "robots.txt",
}

config = json.loads((ROOT / "wrangler.jsonc").read_text(encoding="utf-8"))
assert config.get("name") == "i-care-connect"
assert config.get("workers_dev") is True
assert config.get("assets", {}).get("directory") == "."
assert config.get("assets", {}).get("html_handling") == "auto-trailing-slash"
assert config.get("assets", {}).get("not_found_handling") == "none"

ignore_lines = [line.strip() for line in (ROOT / ".assetsignore").read_text(encoding="utf-8").splitlines() if line.strip() and not line.lstrip().startswith("#")]
assert ignore_lines and ignore_lines[0] == "*"
allowed = {line[1:] for line in ignore_lines if line.startswith("!")}
assert allowed == EXPECTED_ASSETS, f"Cloudflare asset allowlist mismatch: {sorted(allowed ^ EXPECTED_ASSETS)}"
for relative_path in sorted(EXPECTED_ASSETS):
    assert (ROOT / relative_path).is_file(), f"Allowed Cloudflare asset is missing: {relative_path}"
assert not any(path.endswith((".sql", ".md", ".docx", ".pdf", ".zip")) for path in allowed)

# Follow every local runtime reference starting at the public entrypoints. This
# prevents a dynamically loaded file from being omitted while the fixed
# allowlist itself still appears internally consistent.
runtime_pattern = re.compile(r'["\'](?:\./)?([A-Za-z0-9_-]+\.(?:js|css|html|webmanifest|svg|png))(?:\?[^"\']*)?["\']')
pending = ["index.html", "set-password.html", "sil.html", "sil-record.html", "service-worker.js", "manifest.webmanifest"]
visited: set[str] = set()
references: set[str] = set()
while pending:
    source_name = pending.pop()
    if source_name in visited:
        continue
    visited.add(source_name)
    source = (ROOT / source_name).read_text(encoding="utf-8")
    for referenced in runtime_pattern.findall(source):
        references.add(referenced)
        if referenced.endswith((".js", ".html", ".webmanifest")) and referenced not in visited:
            pending.append(referenced)
missing_public_references = references - allowed
assert not missing_public_references, f"Runtime files omitted from Cloudflare assets: {sorted(missing_public_references)}"
for referenced in references:
    assert (ROOT / referenced).is_file(), f"Referenced runtime file is missing: {referenced}"

config_js = (ROOT / "config.js").read_text(encoding="utf-8")
worker_js = (ROOT / "service-worker.js").read_text(encoding="utf-8")
remote_js = (ROOT / "remote-s8-verification.js").read_text(encoding="utf-8")
participant_controls_js = (ROOT / "core-ui-fixes-v3.js").read_text(encoding="utf-8")
regular_tab_js = (ROOT / "regular-medication-tab.js").read_text(encoding="utf-8")
roster_js = (ROOT / "roster-30-day.js").read_text(encoding="utf-8")
deputy_js = (ROOT / "deputy-integration.js").read_text(encoding="utf-8")
deputy_token_ui_js = (ROOT / "deputy-permanent-token-ui-fix.js").read_text(encoding="utf-8")
invoice_js = (ROOT / "invoicing-workspace.js").read_text(encoding="utf-8")

assert "SUPABASE_SERVICE_ROLE_KEY" not in config_js
assert "pushVapidPublicKey" in config_js
assert "xero:" not in config_js
assert "NDIS invoicing" in invoice_js
assert "SCHADS rates are used only for internal staffing-cost checks" in invoice_js
assert "invoice_items" in invoice_js
assert "Prepare email" in invoice_js
assert "Print / save PDF" in invoice_js
assert "invoicing-workspace.js" in regular_tab_js
assert 'loadRuntime("invoicing-workspace.js","20260804-pricing-1")' in regular_tab_js
assert 'loadRuntime("invoice-menu-fix.js","20260804-pricing-1")' in regular_tab_js
assert 'regular-medication-tab.js?v=20260804-7' in config_js
assert 'regular-medication-tab.js?v=20260804-7' in worker_js
assert "INVOICE_UI" in worker_js
assert "invoicing-workspace.js?v=20260804-pricing-1" in worker_js
assert "invoicing-workspace.js?v=20260804-pricing-1" in config_js
assert "invoice-menu-fix.js?v=20260804-pricing-1" in config_js
assert "participant-edit-controls.js" not in config_js
assert "participant-file.js" not in config_js
assert "Edit participant" in participant_controls_js
assert "Approve care plan" in participant_controls_js
assert "remote-s8-verification.js" in config_js
assert "remote-s8-verification.js" in worker_js
assert "submit_remote_s8_verification" in remote_js
assert "verify_remote_s8_entry" in remote_js
assert "not physically witnessed" in remote_js
assert "roster-30-day.js" in regular_tab_js
assert "deputy-permanent-token-ui-fix.js" in regular_tab_js
assert "VIEW_DAYS=30" in roster_js
assert "MAX_SHIFTS=45" in roster_js
assert "Number of weekly shifts to create (1–45)" in roster_js
assert 'loadRuntime("roster-30-day.js","20260812-mobile-regressions-1")' in regular_tab_js
assert 'data-shift-response="${shift.id}"' in roster_js
assert 'data-roster-clock-in="${shift.id}"' in roster_js
assert 'data-roster-clock-out="${shift.id}"' in roster_js
assert 'shift.assigned_staff_id===B().profile.id' in roster_js
assert 'data-roster-days="30"' in roster_js and "__roster30Observer" in roster_js
assert "deputy-integration.js?v=20260809-mobile-main-stability-1" in worker_js
assert 'functions.invoke("deputy-connect"' in deputy_js
assert "Automatically send assigned Florence shifts" in deputy_js
assert "DEPUTY_CLIENT_SECRET" not in deputy_js
assert 'body:{action:"start"}' in deputy_token_ui_js
assert "authorization_url" not in deputy_token_ui_js
assert "DEPUTY_PERMANENT_TOKEN" not in deputy_token_ui_js
assert 'self.addEventListener("push"' in worker_js
assert 'self.addEventListener("notificationclick"' in worker_js
assert 'url.origin!==self.location.origin' in worker_js
assert "withRuntimeFixes" not in worker_js
assert 'event.request.mode==="navigate"' in worker_js
assert '"/set-password"' in worker_js and '"/sil"' in worker_js and '"/sil-record"' in worker_js
assert "void caches.open" not in worker_js
assert "core-ui-fixes-v3.js" in worker_js
assert "participant-actions-direct.js" not in worker_js
assert not any(extension in worker_js for extension in (".sql\"", ".pdf\"", ".docx\"", ".zip\""))

print(f"Cloudflare static-assets audit: PASS ({len(EXPECTED_ASSETS)} public runtime files; {len(references)} references verified)")
