(()=>{
"use strict";
const q=(s,r=document)=>r.querySelector(s);
const B=()=>window.FlorenceBridge;
const keys=["full_name","preferred_name","date_of_birth","ndis_number","address","phone","emergency_contact","guardian_nominee","gp","pharmacy","communication_needs","diagnoses","allergies","goals","preferences","risks_and_safeguards"];
function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800)}
function participantId(){return q("#pf-select")?.value||q("#participant-file-select")?.value||""}
async function openEditor(){
 const b=B();if(!b?.db||!b?.profile)throw new Error("Florence is still loading your secure account.");
 if(b.profile.role!=="supervisor")throw new Error("Only supervisors can edit participant details.");
 const id=participantId();if(!id)throw new Error("Choose a participant first.");
 const {data:p,error}=await b.db.from("participants").select("*").eq("id",id).single();if(error||!p)throw error||new Error("Participant record not found.");
 const f=b.field;
 const fields=[f("full_name","Full legal name","text",[],true),f("preferred_name","Preferred name","text",[],false),f("date_of_birth","Date of birth","date",[],false),f("ndis_number","NDIS number","text",[],false),f("address","Residential address","textarea",[],false),f("phone","Participant phone","text",[],false),f("emergency_contact","Emergency contact details","textarea",[],false),f("guardian_nominee","Guardian or nominee","textarea",[],false),f("gp","GP / doctor details","textarea",[],false),f("pharmacy","Pharmacy details","textarea",[],false),f("communication_needs","Communication needs","textarea",[],false),f("diagnoses","Diagnoses","textarea",[],false),f("allergies","Allergies","textarea",[],false),f("goals","Goals","textarea",[],false),f("preferences","Preferences and routines","textarea",[],false),f("risks_and_safeguards","Risks and safeguards","textarea",[],false)];
 const initial=Object.fromEntries(keys.map(key=>[key,p[key]??""]));
 b.form(`Edit ${p.preferred_name||p.full_name}`,fields,async values=>{
  const payload={};for(const key of keys){const value=String(values[key]??"").trim();payload[key]=value||null}
  if(!payload.full_name)throw new Error("Full legal name is required.");payload.updated_at=new Date().toISOString();
  const {error:updateError}=await b.db.from("participants").update(payload).eq("id",id);if(updateError)throw updateError;
  await b.auditAccess?.("UPDATE","participants",id,{fields:keys});
  setTimeout(()=>window.FlorenceRefresh?.(),400);return "Participant details updated";
 },initial);
}
async function approveCarePlan(){
 const b=B();if(!b?.db||!b?.profile)throw new Error("Florence is still loading your secure account.");
 if(b.profile.role!=="supervisor")throw new Error("Only supervisors can approve care plans.");
 const id=participantId();if(!id)throw new Error("Choose a participant first.");
 if(!confirm("Approve the current uploaded care plan and its at-a-glance details?"))return;
 const approvedAt=new Date().toISOString();
 const {error}=await b.db.from("participants").update({care_plan_approved_at:approvedAt,care_plan_approved_by:b.profile.id,updated_at:approvedAt}).eq("id",id);if(error)throw error;
 await b.auditAccess?.("UPDATE","participants",id,{action:"CARE_PLAN_APPROVED",version:q("#pf-content")?.textContent?.match(/Care plan version\s+(\d+)/i)?.[1]||null});
 toast("Care plan approved");setTimeout(()=>window.FlorenceRefresh?.(),400);
}
function ensureButtons(){
 const b=B();if(!b?.profile)return;
 const hero=q("#pf-content .pf-hero")||q("#participant-file-content .pf-hero")||q("#participant-file-content .participant-file-hero");
 if(hero&&b.profile.role==="supervisor"&&!q("#edit-participant-direct",hero)){
  const area=hero.lastElementChild||hero;const button=document.createElement("button");button.id="edit-participant-direct";button.type="button";button.className="secondary participant-action-button";button.textContent="Edit participant";button.onclick=e=>{e.preventDefault();e.stopPropagation();void openEditor().catch(error=>toast(error?.message||"Florence could not edit this participant."))};area.appendChild(button);
 }
 const careActive=q('[data-pf-tab="care"].active')||q('[data-pf-tab="care-plan"].active')||q('[data-participant-file-tab="care-plan"].active');
 const body=q("#pf-content .pf-body")||q("#participant-file-content .pf-body")||q("#participant-file-content .participant-file-tab-content");
 if(careActive&&body&&b.profile.role==="supervisor"&&!q("#approve-care-plan-direct",body)&&/Approval pending/i.test(body.textContent||"")){
  const pending=[...body.querySelectorAll(".badge,.amber")].find(el=>/Approval pending/i.test(el.textContent||""));
  const button=document.createElement("button");button.id="approve-care-plan-direct";button.type="button";button.className="primary participant-action-button";button.textContent="Approve care plan";button.onclick=e=>{e.preventDefault();e.stopPropagation();void approveCarePlan().catch(error=>toast(error?.message||"Florence could not approve this care plan."))};
  (pending?.parentElement||body).appendChild(button);
 }
}
const observer=new MutationObserver(ensureButtons);
function start(){const host=q("#pf-content")||q("#participant-file-content");if(host&&!host.__directParticipantActions){observer.observe(host,{childList:true,subtree:true});host.__directParticipantActions=true}ensureButtons()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("florence:ready",start);window.addEventListener("pageshow",start);document.addEventListener("click",()=>setTimeout(ensureButtons,60));setInterval(start,750);
const style=document.createElement("style");style.textContent='.pf-hero>div:last-child,.participant-file-hero>div:last-child{display:flex;flex-direction:column;align-items:flex-end;gap:10px}.participant-action-button{margin-top:8px;white-space:nowrap}.pf-hero .participant-action-button,.participant-file-hero .participant-action-button{background:#fff!important;color:#315d46!important;border-color:#fff!important}';document.head.appendChild(style);
})();
