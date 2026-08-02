from pathlib import Path

# Temporary deterministic helper used only while the reviewed PR is validated.
path = Path(__file__).resolve().parents[1] / "tests" / "florence_static_audit.py"
source = path.read_text(encoding="utf-8")
marker = "# Schedule 8 dual PIN and automatic timeline controls."
result_block = '''print(f"Florence static audit: {len(PASSES)} checks passed")
if FAILURES:
    print(f"Florence static audit: {len(FAILURES)} checks FAILED", file=sys.stderr)
    for failure in FAILURES:
        print(f" - {failure}", file=sys.stderr)
    raise SystemExit(1)

print("Florence static audit result: PASS_FOR_LIVE_UAT")
'''

if marker not in source:
    raise SystemExit("S8 regression block is missing")
if source.index(marker) < source.index(result_block):
    print("S8 regression checks already run before the final result.")
    raise SystemExit(0)

prefix, block = source.split(marker, 1)
if result_block not in prefix:
    raise SystemExit("Could not find the static audit result block")
prefix = prefix.replace(result_block, "", 1).rstrip() + "\n\n"
source = prefix + marker + block.rstrip() + "\n\n" + result_block
path.write_text(source, encoding="utf-8")
print("Static audit result ordering corrected.")
