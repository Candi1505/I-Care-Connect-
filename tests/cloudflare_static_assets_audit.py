from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_ASSETS = {
    "index.html", "styles.css", "config.js", "app.js", "operations.js",
    "staff-management.js", "setup-code-display.js", "portal-participant-label.js",
    "push-notifications.js", "portal-care-plan.js", "participant-edit-controls.js",
    "medication-prn-fix.js", "regular-medication-tab.js", "roster-30-day.js",
    "deputy-integration.js", "deputy-permanent-token-ui-fix.js",
    "invoicing-workspace.js", "invoice-menu-fix.js", "florence-readiness-controls.js",
    "remote-s8-verification.js", "set-password.html", "set-password.js",
    "sil.html", "sil.css", "sil.js", "service-worker.js", "manifest.webmanifest",
    "florence-icon.svg", "_headers", "robots.txt",
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

config_js = (ROOT / "config.js").read_text(encoding="utf-8")
worker_js = (ROOT / "service-worker.js").read_text(encoding="utf-8")
remote_js = (ROOT / "remote-s8-verification.js").read_text(encoding="utf-8")
participant_controls_js = (ROOT / "participant-edit-controls.js").read_text(encoding="utf-8")
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
assert "participant-edit-controls.js" in config_js
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
assert "deputy-integration.js?v=20260804-3" in worker_js
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
assert 'url.pathname.endsWith("/set-password.html")' in worker_js
assert "core-ui-fixes-v3.js" in worker_js
assert "participant-actions-direct.js" not in worker_js
assert not any(extension in worker_js for extension in (".sql\"", ".pdf\"", ".docx\"", ".zip\""))

print(f"Cloudflare static-assets audit: PASS ({len(EXPECTED_ASSETS)} public runtime files)")
