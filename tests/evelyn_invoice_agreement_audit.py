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

CATALOGUE_MAXIMUMS = {
    "01_801_0138_1_1": 73.58,
    "01_802_0138_1_1": 81.07,
    "01_803_0138_1_1": 82.57,
    "01_804_0138_1_1": 103.54,
    "01_805_0138_1_1": 133.50,
    "01_806_0138_1_1": 163.46,
    "01_832_0138_1_1": 311.79,
    "04_104_0125_6_1": 73.58,
}

for code, (name, unit, rate) in EXPECTED.items():
    pattern = re.compile(
        rf'support_item_number:"{re.escape(code)}",support_item_name:"{re.escape(name)}",'
        rf'unit:"{unit}",unit_price:{rate}(?:,|\}})'
    )
    assert pattern.search(SOURCE), f"Missing or incorrect agreement service: {code}"

for code, maximum in CATALOGUE_MAXIMUMS.items():
    number = re.escape(f"{maximum:.2f}".rstrip("0").rstrip("."))
    assert re.search(rf'support_item_number:"{re.escape(code)}".*?national_price:{number}0*(?:,|\}})', SOURCE), f"Missing 2026–27 national maximum: {code}"

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
assert 'https://www.ndis.gov.au/providers/pricing-and-payments/pricing/what-support-catalogue' in SOURCE
assert 'worker_cost_estimate:workerCostForLine(line)' in SOURCE
assert '12% super and 1% assumed allowance' in SOURCE
assert 'SCHADS_LEVELS={"1":{name:"DSW level 1",base:38.50}' in SOURCE
assert 'public_holiday:{name:"Public holiday",loading:1.5}' in SOURCE
assert 'Math.min(agreementUnitPrice,Number(cataloguePrice))' in SOURCE
assert 'cannot exceed the selected location maximum' in SOURCE
assert 'SIL services before 1 July 2026 must use the former 0115' in SOURCE
assert 'SIL services from 1 July 2026 must use the new 0138' in SOURCE
assert 'id="smart-pricing-confirm"' in SOURCE
assert 'https://calculate.fairwork.gov.au/payguides/fairwork/ma000100/pdf' in SOURCE
assert 'db.from("ndis_support_catalogue").select("*")' in SOURCE
assert 'db.from("invoice_email_log").insert' in SOURCE
assert 'auditAccess?.("EXPORT","invoices"' in SOURCE
assert 'Xero' not in SOURCE

print("Evelyn invoice pricing audit: PASS (agreement rates capped, catalogue/date limits, SCHADS checks and audit trail)")
