(()=>{
"use strict";
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const B=()=>window.FlorenceBridge;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const fmtDate=value=>value?new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(value)):"Not recorded";
const fmtDateTime=value=>value?new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value)):"";
let mounted=false,activeParticipantId="",activeTab="overview",cache=new Map();

function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
function empty(message){return `<div class="empty">${esc(message)}</div>`}
function textBlock(label,value){return `<section class="participant-file-item"><h4>${esc(label)}</h4><p>${value?esc(value).replace(/\n/g,"<br>"):"Not recorded"}</p></section>`}
function badge(value,kind="good"){return `<span class="badge ${kind}">${esc(value)}</span>`}

async function loadParticipants(){
 const b=B();if(!b?.db||!b?.profile)return [];
 const {data,error}=await b.db.from("participants").select("*").order("full_name");
 if(error)throw error;
 return data||[];
}

async function loadParticipantFile(participant){
 if(cache.has(participant.id))return cache.get(participant.id);
 const b=B(),db=b.db,id=participant.id;
 const [medsRes,notesRes,timelineRes,docsRes,incidentsRes,shiftsRes]=await Promise.all([
  db.from("medications").select("id,medication_name,dose,route,administration_time,medication_type,instructions,active,ceased_at,hold_from,hold_until,prn_indication,max_prn_dose").eq("participant_id",id).order("administration_time"),
  db.from("progress_notes").select("id,category,content,status,recorded_at,staff_id").eq("participant_id",id).order("recorded_at",{ascending:false}).limit(10),
  db.from("client_timeline").select("id,event_type,severity,occurred_at,title,description,action_taken,follow_up").eq("participant_id",id).order("occurred_at",{ascending:false}).limit(15),
  db.from("compliance_documents").select("id,title,category,review_date,version,uploaded_at,storage_path").eq("scope","Participant").eq("subject_id",id).order("uploaded_at",{ascending:false}),
  db.from("incidents").select("id,category,severity,status,occurred_at,description").eq("participant_id",id).order("occurred_at",{ascending:false}).limit(10),
  db.from("shifts").select("id,starts_at,ends_at,status,response,shift_type").eq("participant_id",id).gte("ends_at",new Date().toISOString()).order("starts_at").limit(5)
 ]);
 for(const result of [medsRes,notesRes,timelineRes,docsRes,incidentsRes,shiftsRes])if(result.error)console.warn("Florence participant file section unavailable",result.error.message);
 const result={participant,medications:medsRes.data||[],notes:notesRes.data||[],timeline:timelineRes.data||[],documents:docsRes.data||[],incidents:incidentsRes.data||[],shifts:shiftsRes.data||[]};
 cache.set(id,result);return result;
}

function renderHero(file){
 const p=file.participant,name=p.preferred_name||p.full_name||"Participant";
 const alerts=[p.allergies&&`Allergies: ${p.allergies}`,p.risks_and_safeguards&&`Risks: ${p.risks_and_safeguards}`].filter(Boolean);
 return `<div class="participant-file-hero"><div><p class="eyebrow">Participant file</p><h2>${esc(name)}</h2><p>${esc(p.full_name||name)}${p.date_of_birth?` · DOB ${esc(fmtDate(p.date_of_birth))}`:""}</p></div><div class="participant-file-hero-badges">${badge(p.status||"Active",String(p.status).toLowerCase()==="active"?"good":"amber")}${p.care_plan_approved_at?badge("Care plan approved","good"):badge("Care plan approval pending","amber")}</div></div>${alerts.length?`<div class="participant-file-alert">${alerts.map(esc).join("<br>")}</div>`:""}`;
}

function renderOverview(file){
 const p=file.participant,activeMeds=file.medications.filter(m=>m.active&&!m.ceased_at),regular=activeMeds.filter(m=>String(m.medication_type).toLowerCase()!=="prn"),prn=activeMeds.filter(m=>String(m.medication_type).toLowerCase()==="prn");
 const nextShift=file.shifts[0];
 return `<div class="participant-file-stats"><article><strong>${activeMeds.length}</strong><span>Active medications</span></article><article><strong>${prn.length}</strong><span>PRN medications</span></article><article><strong>${file.notes.length}</strong><span>Recent notes shown</span></article><article><strong>${file.documents.length}</strong><span>Participant documents</span></article></div><div class="participant-file-grid two"><article class="panel"><div class="panel-head"><div><p class="eyebrow">Care essentials</p><h3>What workers need to know</h3></div></div><div class="participant-file-info-grid">${textBlock("Communication needs",p.communication_needs)}${textBlock("Preferences",p.preferences)}${textBlock("Diagnoses",p.diagnoses)}${textBlock("Allergies",p.allergies)}${textBlock("Risks and safeguards",p.risks_and_safeguards)}${textBlock("Goals",p.goals)}</div></article><article class="panel"><div class="panel-head"><div><p class="eyebrow">Current picture</p><h3>Quick summary</h3></div></div><div class="participant-file-summary-row"><strong>Regular medicines</strong><span>${regular.length}</span></div><div class="participant-file-summary-row"><strong>Open incidents</strong><span>${file.incidents.filter(i=>String(i.status).toLowerCase()!=="closed").length}</span></div><div class="participant-file-summary-row"><strong>Next shift</strong><span>${nextShift?fmtDateTime(nextShift.starts_at):"None scheduled"}</span></div><div class="participant-file-summary-row"><strong>Care plan review</strong><span>${fmtDate(p.care_plan_review_date)}</span></div><div class="participant-file-summary-row"><strong>Emergency contact</strong><span>${esc(p.emergency_contact||"Not recorded")}</span></div></article></div>`;
}

function renderMedications(file){
 const meds=file.medications.filter(m=>m.active&&!m.ceased_at);
 if(!meds.length)return empty("No active medications are recorded for this participant.");
 const cards=meds.map(m=>`<article class="participant-med-card"><div class="panel-head"><div><h3>${esc(m.medication_name)}</h3><p>${esc(m.dose)} · ${esc(m.route)}${m.administration_time?` · ${esc(String(m.administration_time).slice(0,5))}`:""}</p></div>${badge(m.medication_type||"Regular",String(m.medication_type).toLowerCase()==="prn"?"amber":"good")}</div>${m.prn_indication?`<p><strong>PRN indication:</strong> ${esc(m.prn_indication)}</p>`:""}${m.max_prn_dose?`<p><strong>Maximum/limits:</strong> ${esc(m.max_prn_dose)}</p>`:""}${m.instructions?`<p><strong>Instructions:</strong> ${esc(m.instructions)}</p>`:""}${m.hold_from||m.hold_until?`<div class="notice"><strong>Medication hold</strong><p>${m.hold_from?`From ${esc(fmtDate(m.hold_from))}`:""}${m.hold_until?` until ${esc(fmtDate(m.hold_until))}`:""}</p></div>`:""}</article>`).join("");
 return `<div class="participant-file-actionbar"><p>Medication profiles are shown here for quick reference. Use Medication & MAR to administer and sign.</p><button type="button" class="secondary" data-participant-file-open="medications">Open MAR</button></div><div class="participant-file-med-grid">${cards}</div>`;
}

function renderCarePlan(file){
 const p=file.participant;
 return `<div class="participant-file-actionbar"><div><strong>Care plan version ${Number(p.care_plan_version||1)}</strong><p>Effective ${fmtDate(p.care_plan_effective_from)} · Review ${fmtDate(p.care_plan_review_date)}</p></div>${p.care_plan_approved_at?badge(`Approved ${fmtDate(p.care_plan_approved_at)}`,"good"):badge("Approval pending","amber")}</div><div class="participant-file-info-grid care-plan">${textBlock("Communication needs",p.communication_needs)}${textBlock("Diagnoses",p.diagnoses)}${textBlock("Allergies",p.allergies)}${textBlock("Goals",p.goals)}${textBlock("Preferences",p.preferences)}${textBlock("Risks and safeguards",p.risks_and_safeguards)}</div>`;
}

function renderHealth(file){
 const p=file.participant;
 return `<div class="participant-file-info-grid">${textBlock("Full legal name",p.full_name)}${textBlock("Preferred name",p.preferred_name)}${textBlock("Date of birth",p.date_of_birth?fmtDate(p.date_of_birth):"")}${textBlock("NDIS number",p.ndis_number)}${textBlock("Address",p.address)}${textBlock("Phone",p.phone)}${textBlock("Emergency contact",p.emergency_contact)}${textBlock("Guardian or nominee",p.guardian_nominee)}${textBlock("GP",p.gp)}${textBlock("Pharmacy",p.pharmacy)}${textBlock("Diagnoses",p.diagnoses)}${textBlock("Allergies",p.allergies)}</div>`;
}

function renderNotes(file){
 const notes=file.notes.map(n=>`<article class="participant-file-history-card"><div class="panel-head"><div><h3>${esc(n.category||"Progress note")}</h3><p>${esc(fmtDateTime(n.recorded_at))}</p></div>${badge(n.status||"Final","good")}</div><p>${esc(n.content)}</p></article>`).join("");
 const timeline=file.timeline.map(t=>`<article class="participant-file-history-card"><div class="panel-head"><div><h3>${esc(t.title||t.event_type)}</h3><p>${esc(fmtDateTime(t.occurred_at))} · ${esc(t.event_type)}</p></div>${t.severity?badge(t.severity,/high/i.test(t.severity)?"red":/moderate/i.test(t.severity)?"amber":"good"):""}</div><p>${esc(t.description)}</p>${t.action_taken?`<p><strong>Action:</strong> ${esc(t.action_taken)}</p>`:""}${t.follow_up?`<p><strong>Follow-up:</strong> ${esc(t.follow_up)}</p>`:""}</article>`).join("");
 return `<div class="participant-file-actionbar"><p>Recent participant history appears together here.</p><div class="actions"><button type="button" class="secondary" data-participant-file-open="notes">Open progress notes</button><button type="button" class="secondary" data-participant-file-open="timeline">Open timeline</button></div></div><div class="participant-file-grid two"><section><h3>Recent progress notes</h3>${notes||empty("No progress notes recorded.")}</section><section><h3>Timeline</h3>${timeline||empty("No timeline events recorded.")}</section></div>`;
}

function renderDocuments(file){
 if(!file.documents.length)return empty("No participant documents are currently listed in the compliance register.");
 return `<div class="participant-file-doc-list">${file.documents.map(d=>`<article class="participant-file-doc"><div><strong>${esc(d.title)}</strong><p>${esc(d.category||"Document")} · Version ${Number(d.version||1)}${d.review_date?` · Review ${esc(fmtDate(d.review_date))}`:""}</p></div>${badge("Recorded","good")}</article>`).join("")}</div>`;
}

function tabContent(file){
 if(activeTab==="medications")return renderMedications(file);
 if(activeTab==="care-plan")return renderCarePlan(file);
 if(activeTab==="health")return renderHealth(file);
 if(activeTab==="history")return renderNotes(file);
 if(activeTab==="documents")return renderDocuments(file);
 return renderOverview(file);
}

async function renderSelected(){
 const host=q("#participant-file-content"),select=q("#participant-file-select");if(!host||!select)return;
 activeParticipantId=select.value;
 const participant=select.__participants?.find(p=>p.id===activeParticipantId);
 if(!participant){host.innerHTML=empty("Select a participant to open their file.");return}
 host.innerHTML='<div class="empty">Loading participant file…</div>';
 try{const file=await loadParticipantFile(participant);host.innerHTML=renderHero(file)+`<div class="participant-file-tabs" role="tablist">${[["overview","At a glance"],["medications","Medications"],["care-plan","Care plan"],["health","Health & contacts"],["history","Notes & timeline"],["documents","Documents"]].map(([id,label])=>`<button type="button" data-participant-file-tab="${id}" class="${activeTab===id?"active":""}">${label}</button>`).join("")}</div><div class="participant-file-tab-content">${tabContent(file)}</div>`;}catch(error){host.innerHTML=empty(error?.message||"Florence could not load this participant file.")}
}

async function mount(){
 const view=q("#participants-view"),b=B();if(!view||!b?.db||!b?.profile)return false;
 let section=q("#participant-file-panel");
 if(!section){
  section=document.createElement("section");section.id="participant-file-panel";section.className="participant-file-shell";
  section.innerHTML=`<div class="participant-file-toolbar"><div><p class="eyebrow">Participant overview</p><h2>Participant file</h2><p>Medication, care information and recent records together in one place.</p></div><label>Choose participant<select id="participant-file-select"><option value="">Loading participants…</option></select></label></div><div id="participant-file-content">${empty("Choose a participant to open their file.")}</div>`;
  const pageHead=view.querySelector(".page-head");pageHead?.insertAdjacentElement("afterend",section);
 }
 try{
  const participants=await loadParticipants(),select=q("#participant-file-select");
  select.__participants=participants;
  select.innerHTML=participants.length?participants.map(p=>`<option value="${p.id}">${esc(p.preferred_name||p.full_name)}</option>`).join(""):'<option value="">No participants available</option>';
  if(participants.length){if(!activeParticipantId||!participants.some(p=>p.id===activeParticipantId))activeParticipantId=participants[0].id;select.value=activeParticipantId;await renderSelected()}
  if(!mounted){select.addEventListener("change",()=>{activeTab="overview";void renderSelected()});mounted=true}
  return true;
 }catch(error){q("#participant-file-content").innerHTML=empty(error?.message||"Florence could not load participant files.");return true}
}

document.addEventListener("click",event=>{
 const target=event.target instanceof Element?event.target:null;
 const tab=target?.closest("[data-participant-file-tab]");
 if(tab){activeTab=tab.dataset.participantFileTab;void renderSelected();return}
 const open=target?.closest("[data-participant-file-open]");
 if(open){const view=open.dataset.participantFileOpen;q(`[data-view="${view}"]`)?.click();return}
 if(target?.closest('[data-view="participants"]'))setTimeout(()=>void mount(),80);
});

const style=document.createElement("style");
style.textContent=`.participant-file-shell{margin:0 0 24px}.participant-file-toolbar{display:flex;justify-content:space-between;gap:18px;align-items:end;padding:20px;border:1px solid rgba(95,143,114,.25);border-radius:24px;background:linear-gradient(135deg,#f5faf6,#eaf3ed);margin-bottom:16px}.participant-file-toolbar h2,.participant-file-toolbar p{margin-top:0}.participant-file-toolbar label{min-width:min(320px,100%)}.participant-file-toolbar select{background:#fff}.participant-file-hero{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:22px;border-radius:24px 24px 0 0;background:#5f8f72;color:white}.participant-file-hero h2,.participant-file-hero p{color:white;margin-top:0}.participant-file-hero-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.participant-file-alert{padding:14px 20px;background:#fff6df;border:1px solid #ead293;color:#6d5414;font-weight:600}.participant-file-tabs{display:flex;gap:8px;overflow-x:auto;padding:12px;background:#fff;border-left:1px solid rgba(95,143,114,.2);border-right:1px solid rgba(95,143,114,.2)}.participant-file-tabs button{white-space:nowrap;border:0;border-radius:999px;padding:10px 14px;background:#edf3ef;color:#355946;font-weight:700}.participant-file-tabs button.active{background:#5f8f72;color:#fff}.participant-file-tab-content{padding:18px;border:1px solid rgba(95,143,114,.2);border-radius:0 0 24px 24px;background:#fff}.participant-file-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.participant-file-stats article{padding:16px;border-radius:18px;background:#f4f8f5;text-align:center}.participant-file-stats strong{display:block;font-size:1.7rem;color:#355946}.participant-file-stats span{font-size:.9rem;color:#66726b}.participant-file-grid{display:grid;gap:16px}.participant-file-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.participant-file-info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.participant-file-info-grid.care-plan{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.participant-file-item{padding:15px;border:1px solid rgba(95,143,114,.2);border-radius:16px;background:#f8fbf8}.participant-file-item h4{margin:0 0 7px;color:#355946}.participant-file-item p{margin:0;line-height:1.5}.participant-file-summary-row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid rgba(95,143,114,.15)}.participant-file-actionbar{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:14px;border-radius:16px;background:#f4f8f5;margin-bottom:15px}.participant-file-actionbar p{margin:0}.participant-file-med-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.participant-med-card,.participant-file-history-card{padding:16px;border:1px solid rgba(95,143,114,.2);border-radius:18px;background:#fff}.participant-med-card p,.participant-file-history-card p{line-height:1.5}.participant-file-doc-list{display:grid;gap:10px}.participant-file-doc{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px;border:1px solid rgba(95,143,114,.2);border-radius:16px}.participant-file-doc p{margin:4px 0 0;color:#66726b}@media(max-width:760px){.participant-file-toolbar,.participant-file-hero,.participant-file-actionbar{align-items:stretch;flex-direction:column}.participant-file-toolbar label{min-width:0}.participant-file-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.participant-file-grid.two,.participant-file-info-grid{grid-template-columns:1fr}.participant-file-hero-badges{justify-content:flex-start}}`;
document.head.appendChild(style);

function start(){let attempts=0;const timer=setInterval(()=>{attempts++;void mount().then(done=>{if(done||attempts>120)clearInterval(timer)})},250)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("florence:ready",start);window.addEventListener("pageshow",()=>{cache.clear();start()});
})();
