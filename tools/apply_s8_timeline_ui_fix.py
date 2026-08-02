from __future__ import annotations

from pathlib import Path
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
# Main HTML: explain S8 dual signoff, add witness fields and bump assets.
# ---------------------------------------------------------------------------
index = read("index.html")
index = replace_once(
    index,
    '<div class="page-head"><div><p class="eyebrow">Medication safety</p><h2>Medication & MAR</h2><p>Medication administration is confirmed with the staff member’s six-digit medication PIN.</p></div><button type="button" id="add-med" class="primary admin-only">+ Medication</button></div>',
    '<div class="page-head"><div><p class="eyebrow">Medication safety</p><h2>Medication & MAR</h2><p>Medication administration is confirmed with the staff member’s six-digit PIN. Schedule 8 administration requires a different authorised worker to enter their own PIN as witness.</p></div><button type="button" id="add-med" class="primary admin-only">+ Medication</button></div>',
    "medication page dual-signoff explanation",
)
index = replace_once(
    index,
    '''    <label>Your personal 6-digit medication PIN
      <input id="med-pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off" required>
    </label>
    <small>This PIN is your digital signature and must not be shared.</small>''',
    '''    <label>Your personal 6-digit medication PIN
      <input id="med-pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off" required>
    </label>
    <small>This PIN is your digital signature and must not be shared.</small>
    <div id="s8-dual-signoff" class="notice hidden">
      <strong>Schedule 8 dual sign-off required</strong>
      <p>The second worker must be present, select their own Florence account and enter their own private PIN.</p>
      <label>Second authorised worker
        <select id="s8-witness-id"></select>
      </label>
      <label>Second worker’s personal 6-digit PIN
        <input id="s8-witness-pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off">
      </label>
      <div class="grid two">
        <label>Quantity removed from stock
          <input id="s8-quantity" type="number" inputmode="decimal" min="0.001" step="0.001" placeholder="1">
        </label>
        <label>Balance remaining after administration
          <input id="s8-balance" type="number" inputmode="decimal" min="0" step="0.001" placeholder="0">
        </label>
      </div>
      <small>Neither worker may enter or disclose the other person’s PIN.</small>
    </div>''',
    "Schedule 8 witness form",
)
index = replace_once(index, 'app.js?v=20260801-5', 'app.js?v=20260802-1', "app asset version")
index = replace_once(index, 'operations.js?v=20260801-2', 'operations.js?v=20260802-1', "operations asset version")
write("index.html", index)


# ---------------------------------------------------------------------------
# Main app: collect the second PIN for S8 and display witness evidence.
# ---------------------------------------------------------------------------
app = read("app.js")
app = replace_once(
    app,
    'function isPortalUser(){return profile?.role==="family"||profile?.role==="client"}',
    '''function isPortalUser(){return profile?.role==="family"||profile?.role==="client"}
function isSchedule8Medication(medication){return regexpMedicationType(medication?.medication_type)==="schedule8"}
function regexpMedicationType(value){return String(value||"").toLowerCase().replace(/[^a-z0-9]+/g,"")}
function setS8DualSignoffVisibility(){
 const box=$("#s8-dual-signoff");if(!box)return;
 const required=Boolean(pendingMed&&isSchedule8Medication(pendingMed)&&$("#mar-outcome")?.value==="Administered");
 box.classList.toggle("hidden",!required);
 const witness=$("#s8-witness-id"),witnessPin=$("#s8-witness-pin"),quantity=$("#s8-quantity"),balance=$("#s8-balance");
 if(required&&witness){
  const options=state.staff.filter(person=>person.id!==profile.id&&person.active&&["staff","supervisor"].includes(person.role));
  witness.innerHTML=options.length?`<option value="">Select second worker</option>${options.map(person=>`<option value="${person.id}">${esc(person.full_name)}</option>`).join("")}`:'<option value="">No other active worker available</option>';
 }
 for(const element of [witness,witnessPin,quantity,balance])if(element){element.required=required;if(!required)element.value=""}
}''',
    "Schedule 8 UI helpers",
)
app = replace_once(
    app,
    'db.from("mar_entries").select("*, medication:medications(medication_name), participant:participants(full_name), worker:profiles!mar_entries_staff_id_fkey(full_name)")',
    'db.from("mar_entries").select("*, medication:medications(medication_name), participant:participants(full_name), worker:profiles!mar_entries_staff_id_fkey(full_name), witness:profiles!mar_entries_witnessed_by_fkey(full_name)")',
    "MAR witness relation",
)
app = replace_once(
    app,
    '<p>${esc(m.participant?.full_name)} · Digitally signed by ${esc(m.worker?.full_name)}</p>',
    '<p>${esc(m.participant?.full_name)} · Digitally signed by ${esc(m.worker?.full_name)}${m.dual_signoff_required&&m.witness?.full_name?` · Witnessed by ${esc(m.witness.full_name)}`:""}</p>',
    "MAR history witness name",
)
app = replace_once(
    app,
    '${m.pin_verified?badge("PIN verified"):badge("Recorded by staff")}',
    '${m.dual_signoff_required?badge(m.witness_pin_verified?"Dual PIN verified":"Witness verification missing"):m.pin_verified?badge("PIN verified"):badge("Recorded by staff")}',
    "MAR history verification badge",
)
app = replace_once(
    app,
    'b=e.target.closest("[data-mar-sign]");if(b){if(!isStaffUser())throw new Error("This action is available to staff only");pendingMed=state.medications.find(x=>x.id===b.dataset.marSign);if(!pendingMed)throw new Error("Medication profile not found");$("#mar-outcome").value=b.dataset.outcome||"Administered";$("#mar-reason").value="";$("#mar-notes").value="";$("#mar-reason-label").classList.toggle("required-reason",$("#mar-outcome").value!=="Administered");$("#pin-summary").textContent=`${pendingMed.medication_name} · ${pendingMed.dose} for ${pendingMed.participant?.full_name}`;openDialog($("#pin-dialog"));return}',
    '''b=e.target.closest("[data-mar-sign]");if(b){
   if(!isStaffUser())throw new Error("This action is available to staff only");
   pendingMed=state.medications.find(x=>x.id===b.dataset.marSign);
   if(!pendingMed)throw new Error("Medication profile not found");
   $("#pin-form").reset();
   $("#mar-outcome").value=b.dataset.outcome||"Administered";
   $("#mar-reason-label").classList.toggle("required-reason",$("#mar-outcome").value!=="Administered");
   $("#pin-summary").textContent=`${pendingMed.medication_name} · ${pendingMed.dose} for ${pendingMed.participant?.full_name}`;
   setS8DualSignoffVisibility();openDialog($("#pin-dialog"));return
  }''',
    "open medication signing dialog",
)
app = replace_once(
    app,
    'b=e.target.closest("[data-administer]");if(b){pendingMed=state.medications.find(x=>x.id===b.dataset.administer);$("#pin-summary").textContent=`${pendingMed.medication_name} · ${pendingMed.dose} for ${pendingMed.participant?.full_name}`;openDialog($("#pin-dialog"));return}',
    '''b=e.target.closest("[data-administer]");if(b){
   pendingMed=state.medications.find(x=>x.id===b.dataset.administer);
   if(!pendingMed)throw new Error("Medication profile not found");
   $("#pin-form").reset();$("#mar-outcome").value="Administered";
   $("#pin-summary").textContent=`${pendingMed.medication_name} · ${pendingMed.dose} for ${pendingMed.participant?.full_name}`;
   setS8DualSignoffVisibility();openDialog($("#pin-dialog"));return
  }''',
    "legacy administer dialog",
)
app = regex_once(
    app,
    r'''\$\("#pin-form"\)\.onsubmit=async e=>\{e\.preventDefault\(\);try\{.*?\}\s*catch\(err\)\{toast\(err\.message\)\}\};''',
    '''$("#pin-form").onsubmit=async e=>{e.preventDefault();try{
 const pin=$("#med-pin").value;
 const outcome=$("#mar-outcome").value;
 const reason=$("#mar-reason").value;
 const extra=$("#mar-notes").value.trim();
 if(outcome!=="Administered"&&!reason)throw new Error("Select why the medication was not administered");
 const notes=[reason,extra].filter(Boolean).join(" — ")||null;
 const dualRequired=isSchedule8Medication(pendingMed)&&outcome==="Administered";
 const witnessId=dualRequired?$("#s8-witness-id").value:null;
 const witnessPin=dualRequired?$("#s8-witness-pin").value:null;
 const s8Quantity=dualRequired?Number($("#s8-quantity").value):null;
 const s8Balance=dualRequired?Number($("#s8-balance").value):null;
 if(dualRequired){
  if(!witnessId)throw new Error("Select the second worker witnessing this Schedule 8 administration");
  if(!/^\d{6}$/.test(witnessPin||""))throw new Error("The second worker must enter their own six-digit PIN");
  if(!Number.isFinite(s8Quantity)||s8Quantity<=0)throw new Error("Enter the Schedule 8 quantity removed from stock");
  if(!Number.isFinite(s8Balance)||s8Balance<0)throw new Error("Enter the Schedule 8 balance remaining after administration");
 }
 const {error}=await db.rpc("record_medication_administration",{
  p_medication_id:pendingMed.id,p_pin:pin,p_status:outcome,p_notes:notes,
  p_witness_id:witnessId,p_witness_pin:witnessPin,
  p_s8_quantity:dualRequired?s8Quantity:null,p_s8_balance:dualRequired?s8Balance:null
 });
 if(error)throw error;
 closeDialog($("#pin-dialog"));$("#pin-form").reset();pendingMed=null;await refreshAll();toast(dualRequired?"Schedule 8 MAR dual-signed and saved":`${outcome} MAR entry digitally signed`);
}catch(err){toast(err.message)}};''',
    "dual-PIN MAR submission",
)
app = replace_once(
    app,
    '$("#mar-outcome").onchange=()=>{$("#mar-reason-label").classList.toggle("required-reason",$("#mar-outcome").value!=="Administered")};',
    '$("#mar-outcome").onchange=()=>{$("#mar-reason-label").classList.toggle("required-reason",$("#mar-outcome").value!=="Administered");setS8DualSignoffVisibility()};',
    "outcome dual-signoff visibility",
)
write("app.js", app)


# ---------------------------------------------------------------------------
# Operations: manual S8 stock transactions also require both workers' PINs.
# ---------------------------------------------------------------------------
operations = read("operations.js")
operations = replace_once(
    operations,
    '`Witness: ${B().esc(worker(x.witnessed_by))}`',
    '`Witness: ${B().esc(worker(x.witnessed_by))} · ${x.recorded_pin_verified&&x.witness_pin_verified?"Dual PIN verified":"Legacy witness record"}`',
    "S8 register verification display",
)
operations = regex_once(
    operations,
    r''' q\("#add-controlled-drug"\)\.onclick=\(\)=>form\("Schedule 8 stock transaction",\[.*?\n \],async v=>\{.*?B\(\)\.toast\("Witnessed Schedule 8 transaction saved"\)\}\);''',
    ''' q("#add-controlled-drug").onclick=()=>form("Schedule 8 stock transaction",[
  field("participant_id","Participant","select",participantOptions()),
  field("medication_id","Schedule 8 medication","select",B().state.medications.filter(m=>String(m.medication_type||"").toLowerCase().replace(/[^a-z0-9]+/g,"")==="schedule8").map(m=>({value:m.id,label:m.medication_name+" · "+(m.participant?.full_name||"")}))),
  field("transaction_type","Transaction","select",["Received","Destroyed","Adjustment","Count check"]),
  field("quantity","Quantity","number"),field("balance","Balance after transaction","number"),
  field("recorded_pin","Your personal 6-digit PIN","password"),
  field("witnessed_by","Second authorised worker","select",staffOptions().filter(x=>x.value!==B().profile.id)),
  field("witness_pin","Second worker’s personal 6-digit PIN","password"),
  field("reason","Reason or notes (optional)","textarea",[],false)
 ],async v=>{
  if(!/^\d{6}$/.test(v.recorded_pin||""))throw new Error("Enter your own six-digit PIN");
  if(!v.witnessed_by)throw new Error("Select the second worker witnessing this Schedule 8 transaction");
  if(!/^\d{6}$/.test(v.witness_pin||""))throw new Error("The second worker must enter their own six-digit PIN");
  const quantity=Number(v.quantity),balance=Number(v.balance);
  if(!Number.isFinite(quantity)||quantity<0||(v.transaction_type!=="Count check"&&quantity===0))throw new Error("Enter a valid Schedule 8 quantity");
  if(!Number.isFinite(balance)||balance<0)throw new Error("Enter the Schedule 8 balance after the transaction");
  const {error}=await B().db.rpc("record_controlled_drug_transaction",{
   p_participant_id:v.participant_id,p_medication_id:v.medication_id,
   p_transaction_type:v.transaction_type,p_quantity:quantity,p_balance:balance,
   p_reason:v.reason||null,p_pin:v.recorded_pin,
   p_witness_id:v.witnessed_by,p_witness_pin:v.witness_pin
  });
  if(error)throw error;await loadOperations();B().toast("Dual-signed Schedule 8 transaction saved")
 });''',
    "manual S8 dual-PIN transaction",
)
write("operations.js", operations)


# ---------------------------------------------------------------------------
# Cache and permanent static regression checks.
# ---------------------------------------------------------------------------
service_worker = '''const CACHE="florence-shell-20260802-1";
const SHELL=["./","./index.html","./styles.css?v=20260801-1","./config.js","./app.js?v=20260802-1","./operations.js?v=20260802-1","./staff-management.js?v=20260801-1","./sil.html","./sil.css?v=20260731-1","./sil.js?v=20260801-4","./manifest.webmanifest","./florence-icon.svg"];
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

static_audit = read("tests/florence_static_audit.py")
static_audit = replace_once(
    static_audit,
    '    "florence-final-readiness-upgrade.sql",\n',
    '    "florence-final-readiness-upgrade.sql",\n    "florence-s8-dual-signoff-timeline-upgrade.sql",\n',
    "required S8 migration",
)
static_audit = replace_once(static_audit, "require('app.js?v=20260801-5' in index, \"index loads final app asset\")", "require('app.js?v=20260802-1' in index, \"index loads final app asset\")", "audit app version")
static_audit = replace_once(static_audit, "require('operations.js?v=20260801-2' in index, \"index loads final operations asset\")", "require('operations.js?v=20260802-1' in index, \"index loads final operations asset\")", "audit operations version")
static_audit = replace_once(static_audit, "require('florence-shell-20260801-6' in service_worker, \"service worker uses final cache namespace\")", "require('florence-shell-20260802-1' in service_worker, \"service worker uses final cache namespace\")", "audit cache version")
static_audit = replace_once(static_audit, "for marker in ['app.js?v=20260801-5', 'operations.js?v=20260801-2', 'sil.js?v=20260801-4']:", "for marker in ['app.js?v=20260802-1', 'operations.js?v=20260802-1', 'sil.js?v=20260801-4']:", "audit cached versions")
static_audit += '''\n# Schedule 8 dual PIN and automatic timeline controls.\ns8_upgrade = text("florence-s8-dual-signoff-timeline-upgrade.sql")\nfor marker in [\n    "S8_DUAL_SIGNOFF_TIMELINE_READY",\n    "p_witness_pin text",\n    "witness_pin_verified",\n    "record_controlled_drug_transaction",\n    "sync_mar_entry_to_timeline",\n    "sync_progress_note_to_timeline",\n    "related_mar_entry_id",\n    "related_progress_note_id",\n    "drop policy if exists controlled_drug_register_staff_insert",\n    "revoke insert,update,delete on public.controlled_drug_register from authenticated",\n]:\n    require(marker in s8_upgrade, f"S8/timeline upgrade contains {marker!r}")\nrequire('id="s8-witness-id"' in index and 'id="s8-witness-pin"' in index, "S8 MAR dialog collects the second worker and private PIN")\nrequire('p_witness_id:witnessId' in app and 'p_witness_pin:witnessPin' in app, "S8 MAR sends both witness fields to the controlled RPC")\nrequire('record_controlled_drug_transaction' in operations, "manual S8 stock workflow uses the dual-PIN RPC")\nrequire('.from("controlled_drug_register").insert' not in operations, "browser cannot directly insert Schedule 8 register rows")\n'''
write("tests/florence_static_audit.py", static_audit)

print("Florence S8 dual PIN and participant timeline UI patch applied.")
