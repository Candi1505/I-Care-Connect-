from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "app.js").read_text(encoding="utf-8")
CORE = (ROOT / "core-ui-fixes-v3.js").read_text(encoding="utf-8")
SQL = (ROOT / "florence-progress-note-session-permission-hotfix.sql").read_text(encoding="utf-8")

assert 'const ACTIVITY_KEY="florence:last-activity"' in APP
assert 'localStorage.setItem(ACTIVITY_KEY,String(Date.now()))' in APP
assert APP.count('localStorage.removeItem(ACTIVITY_KEY)') >= 4
assert 'async function secureRpc(functionName,parameters)' in APP
assert 'await secureRpc("record_progress_note"' in APP
assert APP.count('await secureRpc("record_medication_administration"') == 2
assert 'db.auth.refreshSession()' in APP
assert 'if(!readLast())writeLast()' in CORE
assert 'revoke all on function public.record_progress_note(uuid,text,text,text,text,boolean) from public, anon;' in SQL
assert 'grant execute on function public.record_progress_note(uuid,text,text,text,text,boolean) to authenticated, service_role;' in SQL
assert "notify pgrst, 'reload schema';" in SQL
assert "has_function_privilege('anon',v_function,'EXECUTE')" in SQL

print("Florence progress-note session audit: PASS (fresh inactivity clock, secure RPC retry and least-privilege grant)")
