from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
index = (ROOT / "index.html").read_text(encoding="utf-8")
script = (ROOT / "florence-community-late-entry.js").read_text(encoding="utf-8")
styles = (ROOT / "florence-community-late-entry.css").read_text(encoding="utf-8")

assert "florence-community-late-entry.js?v=20260904-1" in index
assert "florence-community-late-entry.css?v=20260904-1" in index

for form_title in (
    "Community & social support record",
    "Community support daily handover",
    "Daily client choices",
    "Community support expenditure",
    "Participant transport & mileage",
    "Visitor / contractor log",
    "Progress note",
    "Incident report",
    "Timeline event",
):
    assert form_title in script, f"Late-entry support missing for {form_title}"

for required in (
    'dateName: "service_occurred_at"',
    'reason.name = "late_entry_reason"',
    "Florence will still keep the genuine submission time",
    "Entry type: Late entry",
    "Submitted to Florence:",
    "Choose a date and time that has already happened.",
    "event.stopImmediatePropagation()",
):
    assert required in script, f"Late-entry audit control missing: {required}"

assert "TWELVE_HOURS_MS" in script
assert 'dateInput.max = localDateTimeValue(now)' in script
assert ".late-entry-panel.is-late" in styles
assert ".late-entry-reason[hidden]" in styles

print("Florence community late-entry audit passed")
