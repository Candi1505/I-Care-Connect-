from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_ASSETS = {
    "index.html",
    "styles.css",
    "config.js",
    "app.js",
    "operations.js",
    "staff-management.js",
    "setup-code-display.js",
    "portal-participant-label.js",
    "push-notifications.js",
    "portal-care-plan.js",
    "medication-prn-fix.js",
    "regular-medication-tab.js",
    "florence-readiness-controls.js",
    "set-password.html",
    "set-password.js",
    "sil.html",
    "sil.css",
    "sil.js",
    "service-worker.js",
    "manifest.webmanifest",
    "florence-icon.svg",
    "_headers",
    "robots.txt",
}

config = json.loads((ROOT / "wrangler.jsonc").read_text(encoding="utf-8"))
assert config.get("name") == "i-care-connect", "Cloudflare Worker name must match the dashboard project"
assert config.get("workers_dev") is True, "workers.dev must remain available during controlled cutover testing"
assert config.get("assets", {}).get("directory") == ".", "Wrangler must read the repository-root allowlist"
assert config.get("assets", {}).get("html_handling") == "auto-trailing-slash"
assert config.get("assets", {}).get("not_found_handling") == "none", "Florence is multi-page; missing routes must not silently return Home"

ignore_lines = [
    line.strip()
    for line in (ROOT / ".assetsignore").read_text(encoding="utf-8").splitlines()
    if line.strip() and not line.lstrip().startswith("#")
]
assert ignore_lines and ignore_lines[0] == "*", "Cloudflare assets must be denied by default"
allowed = {line[1:] for line in ignore_lines if line.startswith("!")}
assert allowed == EXPECTED_ASSETS, f"Cloudflare asset allowlist mismatch: {sorted(allowed ^ EXPECTED_ASSETS)}"

for relative_path in sorted(EXPECTED_ASSETS):
    assert (ROOT / relative_path).is_file(), f"Allowed Cloudflare asset is missing: {relative_path}"

assert not any(path.endswith((".sql", ".md", ".docx", ".pdf", ".zip")) for path in allowed)
config_js = (ROOT / "config.js").read_text(encoding="utf-8")
worker_js = (ROOT / "service-worker.js").read_text(encoding="utf-8")
controls_js = (ROOT / "florence-readiness-controls.js").read_text(encoding="utf-8")
assert "SUPABASE_SERVICE_ROLE_KEY" not in config_js
assert "pushVapidPublicKey" in config_js
assert "florence-readiness-controls.js" in config_js, "Runtime modules must load without service-worker HTML injection"
assert 'self.addEventListener("push"' in worker_js
assert 'self.addEventListener("notificationclick"' in worker_js
assert "html.replace" not in worker_js, "Service worker must not rewrite Florence HTML"
assert "medication-prn-fix.js" in worker_js
assert "regular-medication-tab.js" in worker_js
assert "florence-readiness-controls.js" in worker_js
assert "data-edit-medication" in controls_js
assert "progress_note_amendments" in controls_js
assert "weekly_family_updates" in controls_js

print(f"Cloudflare static-assets audit: PASS ({len(EXPECTED_ASSETS)} public runtime files)")
