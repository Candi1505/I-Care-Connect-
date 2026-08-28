from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
index = (ROOT / "index.html").read_text(encoding="utf-8")

module_match = re.search(r'<script type="module"[^>]+src="([^"]+)"', index)
assert module_match, "index.html must load the Florence application module"

module_path = ROOT / module_match.group(1).split("?", 1)[0].lstrip("/")
assert module_path.is_file(), f"Florence application module is missing: {module_path}"

bundle = module_path.read_text(encoding="utf-8")
css = (ROOT / "florence-mfa-onboarding.css").read_text(encoding="utf-8")
fallback = (ROOT / "app.js").read_text(encoding="utf-8")

for required in (
    "Open authenticator app",
    "Copy setup key",
    "Set up on this phone",
    "Never photograph or send the key or QR code",
):
    assert required in bundle, f"Live MFA enrolment is missing: {required}"
    assert required in fallback, f"Fallback MFA enrolment is missing: {required}"

assert "totp.secret" in bundle and "totp.uri" in bundle
assert "totp?.secret" in fallback and "totp?.uri" in fallback

for required in (
    ".mfa-open-authenticator",
    ".mfa-secret-row",
    "user-select: all",
):
    assert required in css, f"MFA onboarding styles are missing: {required}"

assert "florence-mfa-onboarding.css?v=20260828-1" in index
assert not re.search(r"localStorage[^\n]{0,100}(?:totp|secret|setup.?key)", bundle, re.I)
assert not re.search(r"sessionStorage[^\n]{0,100}(?:totp|secret|setup.?key)", bundle, re.I)

print("Florence same-device MFA onboarding audit passed")
