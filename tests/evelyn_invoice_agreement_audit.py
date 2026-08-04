from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / "invoicing-workspace.js").read_text(encoding="utf-8")

EXPECTED = {
    "01_801_0138_1_1": ("Supported Independent Living - Standard - Weekday Daytime", "Hour", 74),
    "01_802_0138_1_1": ("Supported Independent Living - Standard - Weekday Evening", "Hour", 81),
    "01_803_0138_1_1": ("Supported Independent Living - Standard - Weekday Night", "Hour", 83),
    "01_804_0138_1_1": ("Supported Independent Living - Standard - Saturday", "Hour", 104),
    "01_805_0138_1_1": ("Supported Independent Living - Standard - Sunday", "Hour", 134),
    "01_806_0138_1_1": ("Supported Independent Living - Standard - Public Holiday", "Hour", 163),
    "01_832_0138_1_1": ("Supported Independent Living - Night-Time Sleepover", "Each", 312),
    "04_104_0125_6_1": ("Access Community Social and Rec Activ - Standard - Weekday Daytime", "Hour", 73),
}

for code, (name, unit, rate) in EXPECTED.items():
    pattern = re.compile(
        rf'support_item_number:"{re.escape(code)}",support_item_name:"{re.escape(name)}",'
        rf'unit:"{unit}",unit_price:{rate}(?:,|\}})'
    )
    assert pattern.search(SOURCE), f"Missing or incorrect agreement service: {code}"

assert SOURCE.count('agreement:01_') == 7
assert SOURCE.count('agreement:04_') == 1
assert 'const EVELYN_NDIS_NUMBER="430178932"' in SOURCE
assert 'const AGREEMENT_EFFECTIVE_FROM="2026-07-01"' in SOURCE
assert 'addDays(q("#smart-date").value,7)' in SOURCE
assert 'setFortnightDefaults' in SOURCE and 'addDays(end,-13)' in SOURCE
assert 'Public holidays and weekday time bands require VJ\'s review.' in SOURCE
assert 'if(!email)return toast("Add the confirmed recipient email' in SOURCE
assert 'recipient_name:q("#smart-recipient-name").value.trim()||null' in SOURCE
assert 'recipient_email:q("#smart-recipient-email").value.trim()||null' in SOURCE

print("Evelyn invoice agreement audit: PASS (8 exact services, safe defaults and review gates)")
