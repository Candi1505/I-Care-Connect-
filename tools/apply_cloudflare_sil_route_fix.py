from __future__ import annotations

from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return source.replace(old, new, 1)


def regex_once(source: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, lambda _match: replacement, source, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one regex match, found {count}")
    return updated


# ---------------------------------------------------------------------------
# Cloudflare is hosting a multi-page app: index.html + sil.html.
# Unknown routes must not silently return the Home app shell.
# ---------------------------------------------------------------------------
wrangler_path = ROOT / "wrangler.jsonc"
wrangler = json.loads(wrangler_path.read_text(encoding="utf-8"))
wrangler["assets"]["html_handling"] = "auto-trailing-slash"
wrangler["assets"]["not_found_handling"] = "none"
wrangler_path.write_text(json.dumps(wrangler, indent=2) + "\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# Main app: after the normal MFA gate, honour a request to return to SIL.
# ---------------------------------------------------------------------------
app = read("app.js")
app = replace_once(
    app,
    ''' await refreshAll();
 if(isPortalUser())showView("portal");
 if(isSupervisor()){''',
    ''' await refreshAll();
 const requestedReturn=new URL(location.href).searchParams.get("return");
 if(requestedReturn==="sil"&&isStaffUser()){
  history.replaceState({},"",location.pathname);
  location.replace("sil.html");
  return;
 }
 if(isPortalUser())showView("portal");
 if(isSupervisor()){''',
    "main-app SIL return path",
)
write("app.js", app)


# ---------------------------------------------------------------------------
# SIL app: refresh the session, show safe start-up errors, and open PDFs
# reliably on iOS/Safari without monkey-patching the Supabase SDK.
# ---------------------------------------------------------------------------
sil = read("sil.js")
sil = replace_once(
    sil,
    '''const workerCreateRecordTypes=new Set(["visitor","choice","handover"]);
const PROVIDER=''',
    '''const workerCreateRecordTypes=new Set(["visitor","choice","handover"]);
function redirectThroughFlorence(reason=""){
 try{sessionStorage.setItem("florence:return-to","sil")}catch(_ignored){}
 const target=new URL("index.html",location.href);
 target.searchParams.set("return","sil");
 if(reason)target.searchParams.set("reason",reason);
 location.replace(target.toString());
}
function showSilStartupError(error){
 const message=String(error?.message||error||"Florence could not open the SIL workspace").slice(0,800);
 document.documentElement.classList.remove("sil-auth-pending");
 document.body.innerHTML=`<main class="sil-main"><article class="panel sil-startup-error"><p class="eyebrow">Florence SIL</p><h1>The SIL workspace could not open</h1><p>Florence kept you signed in and stopped the silent redirect so the problem can be corrected safely.</p><pre id="sil-startup-error-detail"></pre><div class="actions"><button id="sil-startup-retry" type="button" class="primary">Try again</button><button id="sil-startup-home" type="button" class="secondary">Return to Florence Home</button></div></article></main>`;
 const detail=document.querySelector("#sil-startup-error-detail");
 if(detail)detail.textContent=message;
 document.querySelector("#sil-startup-retry")?.addEventListener("click",()=>location.reload());
 document.querySelector("#sil-startup-home")?.addEventListener("click",()=>location.replace("index.html"));
}
async function auditSilAccess(action,tableName,recordId=null,metadata={}){
 try{
  const {error}=await db.rpc("record_access_event",{p_action:action,p_table_name:tableName,p_record_id:recordId,p_metadata:metadata});
  if(error)console.warn("Florence SIL audit event failed",error.message||error);
 }catch(error){console.warn("Florence SIL audit event failed",error)}
}
const PROVIDER=''',
    "SIL navigation and audit helpers",
)

sil = regex_once(
    sil,
    r'''async function openPrivateDocument\(recordId\)\{.*?\n\}\nasync function sha256Hex''',
    '''async function openPrivateDocument(recordId){
 const openedWindow=window.open("about:blank","_blank");
 if(openedWindow)openedWindow.opener=null;
 try{
  const document=[...privateDocuments.values()].find(item=>item.id===recordId);
  if(!document)throw new Error("The private document record is not available");
  void auditSilAccess("DOWNLOAD","controlled_library",document.id,{title:document.title});
  const bucket=window.FLORENCE_CONFIG.storageBucket;
  const {data,error}=await db.storage.from(bucket).createSignedUrl(document.storage_path,120);
  if(error||!data?.signedUrl)throw error||new Error("Florence could not create the private document link");
  if(openedWindow)openedWindow.location.replace(data.signedUrl);
  else location.assign(data.signedUrl);
 }catch(error){
  try{openedWindow?.close()}catch(_ignored){}
  toast(error.message||"Florence could not open that private document")
 }
}
async function sha256Hex''',
    "private PDF opener",
)

sil = replace_once(
    sil,
    ''' void db.rpc("record_access_event",{p_action:"EXPORT",p_table_name:"sil_records",p_record_id:null,p_metadata:{format:kind,record_count:rows.length}}).catch(()=>{});''',
    ''' void auditSilAccess("EXPORT","sil_records",null,{format:kind,record_count:rows.length});''',
    "SIL export audit",
)

sil = regex_once(
    sil,
    r'''async function authorise\(\)\{.*?\n\}\nauthorise\(\);''',
    '''async function authorise(){
 try{
  if(!window.supabase||!window.FLORENCE_CONFIG?.supabaseUrl||!window.FLORENCE_CONFIG?.supabaseAnonKey)throw new Error("Florence configuration is unavailable.");
  db=window.supabase.createClient(window.FLORENCE_CONFIG.supabaseUrl,window.FLORENCE_CONFIG.supabaseAnonKey);
  const sessionResult=await db.auth.getSession();
  if(sessionResult.error)throw sessionResult.error;
  let session=sessionResult.data.session;
  if(!session){redirectThroughFlorence("sign-in-required");return}
  const refreshed=await db.auth.refreshSession();
  if(!refreshed.error&&refreshed.data.session)session=refreshed.data.session;
  const {data:aal,error:aalError}=await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aalError)throw aalError;
  if(aal?.currentLevel!=="aal2"){redirectThroughFlorence("mfa-required");return}
  const {data,error}=await db.from("profiles").select("id,full_name,role,active,organisation_id").eq("id",session.user.id).single();
  if(error)throw error;
  if(!data?.active)throw new Error("Your Florence account is inactive.");
  if(!["staff","supervisor"].includes(data.role))throw new Error("This account has portal access only and cannot open staff or SIL records.");
  currentProfile=data;
  const supervisor=data.role==="supervisor";
  $('[data-sil-tab="provider"]')?.classList.toggle("hidden",!supervisor);
  $("#sil-provider-panel")?.classList.toggle("hidden",!supervisor);
  $("#sil-library-import-panel")?.classList.toggle("hidden",!supervisor);
  $$('[data-open-form]').forEach(button=>button.classList.toggle("hidden",!supervisor&&!workerCreateRecordTypes.has(button.dataset.openForm)));
  try{localStorage.removeItem("florence-sil-v1")}catch(_ignored){}
  await Promise.all([loadSilState(),loadPrivateDocuments()]);
  render();
  document.documentElement.classList.remove("sil-auth-pending");
  try{sessionStorage.removeItem("florence:return-to")}catch(_ignored){}
 }catch(error){
  console.error("SIL access check failed",error);
  showSilStartupError(error);
 }
}
authorise();''',
    "SIL authorisation and visible error path",
)
write("sil.js", sil)


# ---------------------------------------------------------------------------
# Remove the temporary Supabase RPC compatibility shim and bump web assets.
# ---------------------------------------------------------------------------
sil_html = read("sil.html")
sil_html = replace_once(
    sil_html,
    '''<script src="sil-rpc-audit-fix.js?v=20260801-1"></script>\n''',
    "",
    "remove SIL RPC shim",
)
sil_html = replace_once(
    sil_html,
    '''<script src="sil.js?v=20260801-3"></script>''',
    '''<script src="sil.js?v=20260801-4"></script>''',
    "SIL asset version",
)
write("sil.html", sil_html)

index = read("index.html")
index = replace_once(
    index,
    '''<script src="app.js?v=20260801-4"></script>''',
    '''<script src="app.js?v=20260801-5"></script>''',
    "main app asset version",
)
write("index.html", index)

service_worker = '''const CACHE="florence-shell-20260801-6";
const SHELL=["./","./index.html","./styles.css?v=20260801-1","./config.js","./app.js?v=20260801-5","./operations.js?v=20260801-2","./staff-management.js?v=20260801-1","./sil.html","./sil.css?v=20260731-1","./sil.js?v=20260801-4","./manifest.webmanifest","./florence-icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
  return response;
 }).catch(()=>caches.match(event.request).then(hit=>hit||new Response("Florence is temporarily offline.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}))));
});
'''
write("service-worker.js", service_worker)

staff_management = read("staff-management.js")
staff_management = staff_management.replace(
    "Redeploy the updated function and confirm the live origin is https://candi1505.github.io.",
    "Confirm the Edge Function secrets allow https://i-care-connect.candi1505.workers.dev and redeploy the current function if required.",
)
write("staff-management.js", staff_management)

# Remove the compatibility shim from the Cloudflare public allowlist.
assets_ignore = read(".assetsignore")
assets_ignore = assets_ignore.replace("!sil-rpc-audit-fix.js\n", "")
write(".assetsignore", assets_ignore)

# Update static audit version checks and explicitly prevent the old redirect/shim regressions.
static_audit = read("tests/florence_static_audit.py")
static_audit = replace_once(static_audit, "require('app.js?v=20260801-4' in index, \"index loads final app asset\")", "require('app.js?v=20260801-5' in index, \"index loads final app asset\")", "static audit app version")
static_audit = replace_once(static_audit, "require('sil.js?v=20260801-3' in sil_html, \"SIL page loads final SIL asset\")", "require('sil.js?v=20260801-4' in sil_html, \"SIL page loads final SIL asset\")", "static audit SIL version")
static_audit = replace_once(static_audit, "require('florence-shell-20260801-5' in service_worker, \"service worker uses final cache namespace\")", "require('florence-shell-20260801-6' in service_worker, \"service worker uses final cache namespace\")", "static audit cache version")
static_audit = replace_once(static_audit, "for marker in ['app.js?v=20260801-4', 'operations.js?v=20260801-2', 'sil.js?v=20260801-3']:", "for marker in ['app.js?v=20260801-5', 'operations.js?v=20260801-2', 'sil.js?v=20260801-4']:", "static audit cached assets")
static_audit += '''\n# Cloudflare SIL routing and private-document regression controls.\nrequire('new URL(location.href).searchParams.get("return")' in app, "main app honours return-to-SIL after MFA")\nrequire('showSilStartupError(error)' in sil, "SIL startup failures remain visible instead of silently redirecting Home")\nrequire('await db.auth.refreshSession()' in sil, "SIL refreshes the session before checking MFA assurance")\nrequire('window.open("about:blank","_blank")' in sil, "private PDF opens a browser target before asynchronous signing")\nrequire('.catch(()=>{})' not in re.search(r'async function openPrivateDocument.*?async function sha256Hex',sil,re.S).group(0), "private PDF audit does not call catch on a PostgREST builder")\nrequire('sil-rpc-audit-fix.js' not in sil_html, "SIL no longer depends on the RPC monkey-patch")\n'''
write("tests/florence_static_audit.py", static_audit)

cloudflare_audit = read("tests/cloudflare_static_assets_audit.py")
cloudflare_audit = cloudflare_audit.replace('    "sil-rpc-audit-fix.js",\n', '')
cloudflare_audit = replace_once(
    cloudflare_audit,
    'assert config.get("assets", {}).get("not_found_handling") == "single-page-application"',
    'assert config.get("assets", {}).get("html_handling") == "auto-trailing-slash"\nassert config.get("assets", {}).get("not_found_handling") == "none", "Florence is multi-page; missing routes must not silently return Home"',
    "Cloudflare multi-page routing audit",
)
write("tests/cloudflare_static_assets_audit.py", cloudflare_audit)

workflow = read(".github/workflows/florence-quality-gate.yml")
workflow = workflow.replace("          node --check sil-rpc-audit-fix.js\n", "")
route_step = '''\n      - name: Cloudflare multi-page route smoke test\n        run: |\n          set -euo pipefail\n          npx --yes wrangler@4 dev --local --ip 127.0.0.1 --port 8788 > /tmp/florence-wrangler.log 2>&1 &\n          pid=$!\n          trap 'kill "$pid" 2>/dev/null || true' EXIT\n          for attempt in $(seq 1 40); do\n            if curl --fail --silent http://127.0.0.1:8788/ > /tmp/florence-index.html; then break; fi\n            sleep 1\n          done\n          grep -q '<title>Florence · I-Care Connect</title>' /tmp/florence-index.html\n          curl --fail --silent --location http://127.0.0.1:8788/sil.html > /tmp/florence-sil.html\n          grep -q '<title>Florence · SIL homes & compliance</title>' /tmp/florence-sil.html\n          curl --fail --silent http://127.0.0.1:8788/sil > /tmp/florence-sil-canonical.html\n          grep -q '<title>Florence · SIL homes & compliance</title>' /tmp/florence-sil-canonical.html\n          blocked_status=$(curl --silent --output /tmp/florence-blocked.txt --write-out '%{http_code}' http://127.0.0.1:8788/florence-final-readiness-upgrade.sql)\n          test "$blocked_status" = "404"\n          ! grep -q '<title>Florence · I-Care Connect</title>' /tmp/florence-blocked.txt\n'''
workflow = replace_once(
    workflow,
    '''      - name: Repository whitespace and patch validation\n        run: git diff --check\n''',
    route_step + '''\n      - name: Repository whitespace and patch validation\n        run: git diff --check\n''',
    "Cloudflare route workflow step",
)
write(".github/workflows/florence-quality-gate.yml", workflow)

print("Cloudflare SIL route and private-PDF fix applied successfully.")
