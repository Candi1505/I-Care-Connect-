from __future__ import annotations

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one exact match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected one regex match, found {count}")
    return updated


# ---------------------------------------------------------------------------
# Main Florence app: make family/participant accounts genuinely portal-only.
# ---------------------------------------------------------------------------
app = read("app.js")
app = replace_once(
    app,
    'function showView(v){\n $$(".view")',
    'function showView(v){\n if(isPortalUser()&&v!=="portal")v="portal";\n $$(".view")',
    "portal view guard",
)
app = replace_once(
    app,
    ' $$(".admin-only").forEach(e=>e.classList.toggle("hidden",!isSupervisor()));\n',
    ' $$(".admin-only").forEach(e=>e.classList.toggle("hidden",!isSupervisor()));\n $$(".staff-only").forEach(e=>e.classList.toggle("hidden",!isStaffUser()));\n',
    "staff-only navigation toggle",
)
app = regex_once(
    app,
    r' if\(isPortalUser\(\)\)\{\n.*?\n \}\n const h=',
    ''' if(isPortalUser()){
   $$('[data-view]').forEach(element=>element.classList.toggle("hidden",element.dataset.view!=="portal"));
   $("#backup")?.classList.add("hidden");
   $("#import-backup")?.classList.add("hidden");
   $("#dashboard-timeclock-panel")?.classList.add("hidden");
 }
 const h=''',
    "portal navigation boundary",
)
app = replace_once(
    app,
    ' await refreshAll();\n if(isSupervisor()){',
    ' await refreshAll();\n if(isPortalUser())showView("portal");\n if(isSupervisor()){',
    "portal landing view",
)
write("app.js", app)


# ---------------------------------------------------------------------------
# Time and attendance: use server-timestamped RPCs, not the worker's clock.
# ---------------------------------------------------------------------------
operations = read("operations.js")
operations = replace_once(
    operations,
    'function timesheetWorkType(t){const match=String(t.notes||"").match(/^Work type:\\s*(.+)$/m);return match?.[1]?.trim()||(t.shift_id?"Rostered support":"Work shift")}\nfunction timesheetDisplayNotes(t){return String(t.notes||"").split("\\n").filter(line=>line&&!/^Work type:/i.test(line)).join(" · ")}',
    '''function timesheetWorkType(t){
 return t.work_type||String(t.notes||"").match(/^Work type:\\s*(.+)$/m)?.[1]?.trim()||(t.shift_id?"Rostered support":"Work shift")
}
function timesheetDisplayNotes(t){
 const structured=[t.clock_in_notes,t.clock_out_notes].map(value=>String(value||"").trim()).filter(Boolean);
 if(structured.length)return structured.join(" · ");
 return String(t.notes||"").split("\\n").filter(line=>line&&!/^Work type:/i.test(line)).join(" · ")
}''',
    "structured timesheet display",
)
operations = regex_once(
    operations,
    r'  const \{error\}=await B\(\)\.db\.from\("timesheets"\)\.insert\(\{\n.*?\n  \}\);\n  if\(error\)throw error;',
    '''  const {error}=await B().db.rpc("clock_in_timesheet",{
   p_shift_id:values.shift_id||null,
   p_work_type:values.work_type,
   p_notes:String(values.notes||"").trim()||null
  });
  if(error)throw error;''',
    "server clock-in RPC",
)
operations = regex_once(
    operations,
    r'  const \{error\}=await B\(\)\.db\.from\("timesheets"\)\.update\(\{\n   clock_out:new Date\(\)\.toISOString\(\),\n   break_minutes:breakMinutes,\n   notes,\n   status:"Submitted"\n  \}\)\.eq\("id",open\.id\)\.eq\("staff_id",B\(\)\.profile\.id\);\n  if\(error\)throw error;',
    '''  const {error}=await B().db.rpc("clock_out_timesheet",{
   p_break_minutes:breakMinutes,
   p_notes:finishNote||null
  });
  if(error)throw error;''',
    "server clock-out RPC",
)
# Remove variables that were needed only for the old direct update.
operations = replace_once(
    operations,
    '  const prior=String(open.notes||"").split("\\n").filter(line=>!/^Clock-out note:/i.test(line)).join("\\n");\n  const finishNote=String(values.notes||"").trim();\n  const notes=[prior,finishNote?`Clock-out note: ${finishNote}`:""] .filter(Boolean).join("\\n");',
    '  const finishNote=String(values.notes||"").trim();',
    "remove client-composed clock-out notes",
) if '  const notes=[prior,finishNote?`Clock-out note: ${finishNote}`:""] .filter(Boolean).join("\\n");' in operations else operations
# The source currently has no space before .filter; handle that exact form.
operations = operations.replace(
    '  const prior=String(open.notes||"").split("\\n").filter(line=>!/^Clock-out note:/i.test(line)).join("\\n");\n  const finishNote=String(values.notes||"").trim();\n  const notes=[prior,finishNote?`Clock-out note: ${finishNote}`:""].filter(Boolean).join("\\n");',
    '  const finishNote=String(values.notes||"").trim();',
    1,
)
write("operations.js", operations)


# ---------------------------------------------------------------------------
# SIL workspace: replace unaudited browser localStorage records with Supabase.
# ---------------------------------------------------------------------------
sil = read("sil.js")
sil = replace_once(
    sil,
    'const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],KEY="florence-sil-v1";\ndocument.documentElement.classList.add("sil-auth-pending");\nlet db=null,currentProfile=null;',
    '''const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
document.documentElement.classList.add("sil-auth-pending");
let db=null,currentProfile=null;
let directory={participants:[],staff:[]};
const participantRecordTypes=new Set(["visitor","communication","instructions","choice","agreementExplanation","serviceAgreement","rights","privateSpace","handover"]);
const workerRecordTypes=new Set(["induction","competency","training","observation"]);
const workerCreateRecordTypes=new Set(["visitor","choice","handover"]);''',
    "remove SIL localStorage key",
)
sil = replace_once(
    sil,
    '["participant","Participant host / person affected","text",false]',
    '["participant","Participant"]',
    "visitor participant selector",
)
sil = replace_once(
    sil,
    'handover:{title:"SIL shift handover",category:"Shift handover",help:"Complete at the end of every shift. Record facts and direct observations, not assumptions.",fields:[["house","SIL home"]',
    'handover:{title:"SIL shift handover",category:"Shift handover",help:"Complete at the end of every shift. Record facts and direct observations, not assumptions.",fields:[["participant","Participant"],["house","SIL home"]',
    "handover participant selector",
)
state_block = '''let state={provider:{...PROVIDER},records:[]},activeTab="dashboard";
function participantName(participantId){
 const participant=directory.participants.find(item=>item.id===participantId);
 return participant?.preferred_name||participant?.full_name||"Participant";
}
function staffName(staffId){return directory.staff.find(item=>item.id===staffId)?.full_name||"Worker"}
function rowToRecord(row){return{id:row.id,type:row.record_type,category:row.category,title:row.title,createdAt:row.created_at,updatedAt:row.updated_at,fields:row.fields||{},status:row.status,participant_id:row.participant_id,staff_id:row.staff_id}}
async function loadSilState(){
 const org=currentProfile.organisation_id;
 const [recordsResult,providerResult,participantsResult,staffResult]=await Promise.all([
  db.from("sil_records").select("*").eq("organisation_id",org).is("archived_at",null).order("created_at",{ascending:false}),
  db.from("sil_provider_profiles").select("profile").eq("organisation_id",org).maybeSingle(),
  db.from("participants").select("id,full_name,preferred_name").eq("organisation_id",org).order("full_name"),
  db.from("profiles").select("id,full_name,role,active").eq("organisation_id",org).eq("active",true).in("role",["staff","supervisor"]).order("full_name")
 ]);
 const failed=[recordsResult,providerResult,participantsResult,staffResult].find(result=>result.error);
 if(failed)throw failed.error;
 state.records=(recordsResult.data||[]).map(rowToRecord);
 state.provider={...PROVIDER,...(providerResult.data?.profile||{})};
 directory={participants:participantsResult.data||[],staff:staffResult.data||[]};
}
'''
sil = regex_once(
    sil,
    r'let state=load\(\),activeTab="dashboard";\nfunction load\(\).*?\nfunction save\(\).*?\n(?=function esc\(v\))',
    state_block,
    "replace SIL local state",
)
form_block = '''function fieldHtml(f,recordType){
 let [name,label,type="text",opts=[],required=true]=f;
 if(typeof opts==="boolean"){required=opts;opts=[]}
 const dynamicRequired=(name==="participant"&&participantRecordTypes.has(recordType))||(name==="worker"&&workerRecordTypes.has(recordType));
 const mustComplete=dynamicRequired||required,req=mustComplete?" required":"",hint=mustComplete?"":" <small>(optional)</small>";
 if(name==="participant"){
  const options=directory.participants.map(item=>`<option value="${item.id}">${esc(item.preferred_name||item.full_name)}</option>`).join("");
  return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select participant…</option>${options}</select></label>`
 }
 if(name==="worker"){
  const options=directory.staff.map(item=>`<option value="${item.id}">${esc(item.full_name)}</option>`).join("");
  return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select worker…</option>${options}</select></label>`
 }
 if(type==="textarea")return`<label>${label}${hint}<textarea name="${name}"${req}></textarea></label>`;
 if(type==="select")return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select…</option>${(Array.isArray(opts)?opts:[]).map(option=>{const value=typeof option==="string"?option:option.value,labelText=typeof option==="string"?option:option.label;return`<option value="${esc(value)}">${esc(labelText)}</option>`}).join("")}</select></label>`;
 return`<label>${label}${hint}<input name="${name}" type="${type}"${req}></label>`
}
function openForm(type){
 const schema=schemas[type];if(!schema)return;
 if(currentProfile?.role!=="supervisor"&&!workerCreateRecordTypes.has(type)){toast("This SIL record must be completed by a supervisor");return}
 $("#sil-dialog-title").textContent=schema.title;
 $("#sil-dialog-help").innerHTML=`${esc(schema.help)}<div class="sil-required-note">Fields without “optional” must be completed before saving.</div>`;
 $("#sil-form").dataset.type=type;
 $("#sil-dialog-fields").innerHTML=schema.fields.map(field=>fieldHtml(field,type)).join("");
 const dialog=$("#sil-dialog");dialog.showModal?dialog.showModal():dialog.setAttribute("open","")
}
function closeForm(){const dialog=$("#sil-dialog");dialog.close?dialog.close():dialog.removeAttribute("open")}
async function submit(event){
 event.preventDefault();
 const formElement=event.currentTarget,type=formElement.dataset.type,schema=schemas[type];
 const submitButton=formElement.querySelector('button[type="submit"]');
 if(!schema)return;
 submitButton.disabled=true;submitButton.textContent="Saving securely…";
 try{
  const values=Object.fromEntries(new FormData(formElement));
  if(type==="provider"){
   const {error}=await db.from("sil_provider_profiles").upsert({organisation_id:currentProfile.organisation_id,profile:{...state.provider,...values},updated_by:currentProfile.id},{onConflict:"organisation_id"});
   if(error)throw error;
  }else{
   const participantId=participantRecordTypes.has(type)?String(values.participant||""):null;
   const staffId=workerRecordTypes.has(type)?String(values.worker||""):null;
   if(participantRecordTypes.has(type)&&!participantId)throw new Error("Choose the participant this SIL record belongs to");
   if(workerRecordTypes.has(type)&&!staffId)throw new Error("Choose the worker this SIL record belongs to");
   if(participantId)values.participant=participantName(participantId);
   if(staffId)values.worker=staffName(staffId);
   const status=/Draft|Pending|Awaiting|Needs/.test(Object.values(values).join(" "))?"Needs confirmation":"Complete";
   const {error}=await db.from("sil_records").insert({organisation_id:currentProfile.organisation_id,participant_id:participantId||null,staff_id:staffId||null,record_type:type,category:schema.category,title:schema.title,fields:values,status,created_by:currentProfile.id,updated_by:currentProfile.id});
   if(error)throw error;
  }
  formElement.reset();closeForm();await loadSilState();render();toast(type==="provider"?"Provider profile saved securely":"SIL record saved securely")
 }catch(error){toast(error.message||"Florence could not save this SIL record")}
 finally{submitButton.disabled=false;submitButton.textContent="Save"}
}
'''
sil = regex_once(
    sil,
    r'function fieldHtml\(f\).*?\nfunction submit\(e\).*?\n(?=function recordCard\(r\))',
    form_block,
    "database-backed SIL forms",
)
sil = regex_once(
    sil,
    r'function recordCard\(r\)\{.*?\n(?=function render\(\))',
    '''function recordCard(r){
 const entries=Object.entries(r.fields||{}).filter(([,value])=>value).slice(0,5),risk=r.fields?.risk_level?` sil-risk-${r.fields.risk_level.toLowerCase()}`:"";
 const archive=currentProfile?.role==="supervisor"?`<div class="sil-record-actions"><button class="link" data-archive-record="${r.id}">Archive record</button></div>`:"";
 return`<article class="record${risk}"><div class="record-top"><div><h3>${esc(r.title)}</h3><p>${esc(r.category)} · ${fmt(r.createdAt)}</p></div>${badge(statusOf(r))}</div><p>${entries.map(([key,value])=>`<strong>${esc(key.replaceAll("_"," "))}:</strong> ${esc(value)}`).join("<br>")}</p>${archive}</article>`
}
''',
    "archive-only SIL record cards",
)
sil = replace_once(
    sil,
    '$("#sil-storage-status").textContent="● Records ready";',
    '$("#sil-storage-status").textContent="● Secure Supabase records";',
    "SIL storage status",
)
export_block = '''function exportFile(kind){
 const rows=state.records.map(record=>({id:record.id,category:record.category,title:record.title,status:statusOf(record),created_at:record.createdAt,...record.fields}));
 let blob,name;
 if(kind==="json"){
  blob=new Blob([JSON.stringify({provider:state.provider,records:rows,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});name="Florence-SIL-audit-evidence.json"
 }else{
  const keys=[...new Set(rows.flatMap(Object.keys))],csv=[keys.join(","),...rows.map(row=>keys.map(key=>'"'+String(row[key]??"").replaceAll('"','""')+'"').join(","))].join("\\n");
  blob=new Blob([csv],{type:"text/csv"});name="Florence-SIL-audit-evidence.csv"
 }
 void db.rpc("record_access_event",{p_action:"EXPORT",p_table_name:"sil_records",p_record_id:null,p_metadata:{format:kind,record_count:rows.length}}).catch(()=>{});
 const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=name;link.click();URL.revokeObjectURL(link.href)
}
'''
sil = regex_once(
    sil,
    r'function exportFile\(kind\)\{.*?\n(?=\$\$\(\'\[data-sil-tab\]\'\))',
    export_block,
    "audited SIL export",
)
bindings_block = '''$$('[data-sil-tab]').forEach(button=>button.onclick=()=>{activeTab=button.dataset.silTab;$$('[data-sil-tab]').forEach(item=>item.classList.toggle("active",item===button));$$('.sil-panel').forEach(panel=>panel.classList.toggle("active",panel.id===`sil-${activeTab}-panel`));if(activeTab==="evidence")renderEvidence()});
$$('[data-open-form]').forEach(button=>button.onclick=()=>openForm(button.dataset.openForm));
$("#edit-provider").onclick=()=>{openForm("provider");setTimeout(()=>Object.entries(state.provider||PROVIDER).forEach(([key,value])=>{const input=$(`[name="${key}"]`);if(input)input.value=value}),0)};
$("#sil-form").onsubmit=event=>void submit(event);
$("#sil-dialog-close").onclick=closeForm;$("#sil-dialog-cancel").onclick=closeForm;
$("#sil-refresh").onclick=async()=>{try{await loadSilState();await loadPrivateDocuments();render();toast("SIL workspace refreshed")}catch(error){toast(error.message||"Florence could not refresh SIL records")}};
$("#sil-import-library")?.addEventListener("click",()=>$("#sil-library-zip")?.click());
$("#sil-library-zip")?.addEventListener("change",event=>{const file=event.target.files?.[0];if(file)void importPrivateLibrary(file).catch(error=>{const status=$("#sil-library-import-status");if(status)status.textContent=error.message||"The private library could not be installed";toast(error.message||"The private library could not be installed")})});
$("#sil-export-json").onclick=()=>exportFile("json");$("#sil-export-csv").onclick=()=>exportFile("csv");
["#sil-filter-category","#sil-filter-status","#sil-filter-search"].forEach(selector=>$(selector).addEventListener(selector.includes("search")?"input":"change",renderEvidence));
async function archiveSilRecord(recordId){
 if(currentProfile?.role!=="supervisor")throw new Error("Only a supervisor can archive SIL records");
 const {error}=await db.from("sil_records").update({status:"Archived",archived_by:currentProfile.id,archived_at:new Date().toISOString(),updated_by:currentProfile.id}).eq("id",recordId).eq("organisation_id",currentProfile.organisation_id);
 if(error)throw error;
 await loadSilState();render();toast("SIL record archived with its audit history retained")
}
document.addEventListener("click",event=>{
 const privateButton=event.target.closest("[data-open-private-document]");
 if(privateButton){void openPrivateDocument(privateButton.dataset.openPrivateDocument);return}
 const archiveButton=event.target.closest("[data-archive-record]");
 if(archiveButton&&confirm("Archive this SIL record? It will remain in the secure audit history."))void archiveSilRecord(archiveButton.dataset.archiveRecord).catch(error=>toast(error.message))
});
'''
sil = regex_once(
    sil,
    r'\$\$\(\'\[data-sil-tab\]\'\).*?\n(?=async function authorise\(\))',
    bindings_block,
    "SIL event bindings",
)
authorise_block = '''async function authorise(){
 try{
  if(!window.supabase||!window.FLORENCE_CONFIG?.supabaseUrl||!window.FLORENCE_CONFIG?.supabaseAnonKey)throw new Error("Florence configuration is unavailable.");
  db=window.supabase.createClient(window.FLORENCE_CONFIG.supabaseUrl,window.FLORENCE_CONFIG.supabaseAnonKey);
  const {data:{session}}=await db.auth.getSession();
  if(!session){location.replace("index.html");return}
  const {data:aal,error:aalError}=await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aalError||aal?.currentLevel!=="aal2"){location.replace("index.html");return}
  const {data,error}=await db.from("profiles").select("id,role,active,organisation_id").eq("id",session.user.id).single();
  if(error||!data?.active||!["staff","supervisor"].includes(data.role)){location.replace("index.html");return}
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
 }catch(error){
  console.error("SIL access check failed",error);
  location.replace("index.html");
 }
}
authorise();
})();'''
sil = regex_once(
    sil,
    r'async function authorise\(\)\{.*?authorise\(\);\n\}\)\(\);',
    authorise_block,
    "secure SIL authorisation",
)
write("sil.js", sil)


# ---------------------------------------------------------------------------
# Pin browser dependencies and refresh cache-busted production assets.
# ---------------------------------------------------------------------------
index = read("index.html")
index = replace_once(index, 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.106.2"', "pin Supabase JS in index")
index = replace_once(index, 'app.js?v=20260801-3', 'app.js?v=20260801-4', "app version")
index = replace_once(index, 'operations.js?v=20260801-1', 'operations.js?v=20260801-2', "operations version")
write("index.html", index)

sil_html = read("sil.html")
sil_html = replace_once(sil_html, 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"', 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.106.2"', "pin Supabase JS in SIL")
sil_html = replace_once(sil_html, 'sil.js?v=20260801-2', 'sil.js?v=20260801-3', "SIL version")
write("sil.html", sil_html)

service_worker = read("service-worker.js")
service_worker = replace_once(service_worker, 'florence-shell-20260801-4', 'florence-shell-20260801-5', "service-worker cache")
service_worker = replace_once(service_worker, 'app.js?v=20260801-3', 'app.js?v=20260801-4', "cached app version")
service_worker = replace_once(service_worker, 'operations.js?v=20260801-1', 'operations.js?v=20260801-2', "cached operations version")
service_worker = replace_once(service_worker, 'sil.js?v=20260801-2', 'sil.js?v=20260801-3', "cached SIL version")
write("service-worker.js", service_worker)


# ---------------------------------------------------------------------------
# Harden the final migration's prerequisites and test-record lookup.
# ---------------------------------------------------------------------------
sql = read("florence-final-readiness-upgrade.sql")
sql = replace_once(
    sql,
    "    or to_regprocedure('public.can_access_participant(uuid)') is null\n    or to_regprocedure('public.audit_row_change()') is null then",
    "    or to_regprocedure('public.can_access_participant(uuid)') is null\n    or to_regprocedure('public.current_participant_id()') is null\n    or to_regprocedure('public.is_worker_controlled_document(text)') is null\n    or to_regprocedure('public.audit_row_change()') is null then",
    "final migration prerequisites",
)
sql = replace_once(sql, " if p_work_type not in(\n", " if p_work_type is null or p_work_type not in(\n", "null work-type rejection")
sql = replace_once(
    sql,
    " select count(*),min(id),min(organisation_id)\n into v_participant_count,v_participant_id,v_participant_org\n from public.participants\n where lower(btrim(full_name))='mary jane';",
    " select count(*) into v_participant_count\n from public.participants\n where lower(btrim(full_name))='mary jane';\n select id,organisation_id into v_participant_id,v_participant_org\n from public.participants\n where lower(btrim(full_name))='mary jane'\n order by id\n limit 1;",
    "safe Mary Jane lookup",
)
sql = replace_once(
    sql,
    " select count(*),min(id),min(participant_id)\n into v_sifrol_count,v_sifrol_id,v_sifrol_participant\n from public.medications\n where lower(btrim(medication_name))='sifrol';",
    " select count(*) into v_sifrol_count\n from public.medications\n where lower(btrim(medication_name))='sifrol';\n select id,participant_id into v_sifrol_id,v_sifrol_participant\n from public.medications\n where lower(btrim(medication_name))='sifrol'\n order by id\n limit 1;",
    "safe Sifrol lookup",
)
# Add provider-profile validation before its RLS policies.
provider_validation = '''create or replace function public.validate_sil_provider_profile()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_profile public.profiles%rowtype;
begin
 select * into v_profile from public.profiles where id=new.updated_by and active=true;
 if v_profile.id is null or v_profile.role<>'supervisor' or v_profile.organisation_id<>new.organisation_id then
  raise exception 'The SIL provider profile must be signed by an active supervisor in this organisation';
 end if;
 if auth.uid() is not null and new.updated_by<>auth.uid() then
  raise exception 'The signed-in supervisor must sign the SIL provider profile update';
 end if;
 if octet_length(new.profile::text)>262144 then
  raise exception 'The SIL provider profile is too large';
 end if;
 new.updated_at=now();
 return new;
end;
$$;

drop trigger if exists sil_provider_profiles_validate on public.sil_provider_profiles;
create trigger sil_provider_profiles_validate
before insert or update on public.sil_provider_profiles
for each row execute function public.validate_sil_provider_profile();

'''
sql = replace_once(
    sql,
    "alter table public.sil_records enable row level security;\nalter table public.sil_provider_profiles enable row level security;",
    provider_validation + "alter table public.sil_records enable row level security;\nalter table public.sil_provider_profiles enable row level security;",
    "provider profile validation",
)
sql = replace_once(
    sql,
    " else 'PASS'\n end as florence_final_readiness_migration,\n (select count(*) from public.sil_records) as existing_sil_records,\n (select count(*) from public.timesheets where clock_out is null and status='Open') as currently_open_timesheets;",
    " else 'PASS_FOR_LIVE_UAT'\n end as florence_final_readiness_migration,\n (select count(*) from public.participants where lower(btrim(full_name))='mary jane') as mary_jane_remaining,\n (select count(*) from public.medications where lower(btrim(medication_name))='sifrol') as sifrol_remaining,\n (select count(*) from public.compliance_documents where category='Controlled library') as private_controlled_documents,\n (select count(*) from public.sil_records) as existing_sil_records,\n (select count(*) from public.timesheets where clock_out is null and status='Open') as currently_open_timesheets;",
    "final readiness output",
)
write("florence-final-readiness-upgrade.sql", sql)

print("Florence final-readiness patch applied successfully.")
