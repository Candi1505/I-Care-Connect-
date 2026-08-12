(()=>{
"use strict";
// Compatibility shim only. core-ui-fixes-v3 owns participant controls.
return;
const q=(selector,root=document)=>root.querySelector(selector);
const B=()=>window.FlorenceBridge;
const fields=["full_name","preferred_name","date_of_birth","ndis_number","address","phone","emergency_contact","guardian_nominee","gp","pharmacy","communication_needs","diagnoses","allergies","goals","preferences","risks_and_safeguards"];
function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800)}
function participantId(){return q("#pf-select")?.value||q("#participant-file-select")?.value||""}
function isSupervisor(){return ["supervisor","admin","owner"].includes(String(B()?.profile?.role||"").toLowerCase())}
async function openEditor(){
 const b=B();if(!b?.db||!b?.profile)throw new Error("Florence is still loading your secure account.");
 if(!isSupervisor())throw new Error("Only supervisors can edit participant details.");
 const id=participantId();if(!id)throw new Error("Choose a participant first.");
 const {data:p,error}=await b.db.from("participants").select("*").eq("id",id).single();if(error||!p)throw error||new Error("Participant record not found.");
 const f=b.field;
 const formFields=[f("full_name","Full legal name","text",[],true),f("preferred_name","Preferred name","text",[],false),f("date_of_birth","Date of birth","date",[],false),f("ndis_number","NDIS number","text",[],false),f("address","Residential address","textarea",[],false),f("phone","Participant phone","text",[],false),f("emergency_contact","Emergency contact details","textarea",[],false),f("guardian_nominee","Guardian or nominee","textarea",[],false),f("gp","GP / doctor details","textarea",[],false),f("pharmacy","Pharmacy details","textarea",[],false),f("communication_needs","Communication needs","textarea",[],false),f("diagnoses","Diagnoses","textarea",[],false),f("allergies","Allergies","textarea",[],false),f("goals","Goals","textarea",[],false),f("preferences","Preferences and routines","textarea",[],false),f("risks_and_safeguards","Risks and safeguards","textarea",[],false)];
 const values=Object.fromEntries(fields.map(key=>[key,p[key]??""]));
 b.form(`Edit ${p.preferred_name||p.full_name}`,formFields,async next=>{const payload={};for(const key of fields){const value=String(next[key]??"").trim();payload[key]=value||null}if(!payload.full_name)throw new Error("Full legal name is required.");payload.updated_at=new Date().toISOString();const {error:updateError}=await b.db.from("participants").update(payload).eq("id",id);if(updateError)throw updateError;await b.auditAccess?.("UPDATE","participants",id,{fields});setTimeout(()=>window.FlorenceRefresh?.()||location.reload(),400);return "Participant details updated"},values);
}
async function approvePlan(){
 const b=B();if(!b?.db||!b?.profile)throw new Error("Florence is still loading your secure account.");
 if(!isSupervisor())throw new Error("Only supervisors can approve care plans.");
 const id=participantId();if(!id)throw new Error("Choose a participant first.");
 if(!confirm("Approve the current care plan as the authorised version?"))return;
 const now=new Date().toISOString();const {error}=await b.db.from("participants").update({care_plan_approved_at:now,care_plan_approved_by:b.profile.id,updated_at:now}).eq("id",id);if(error)throw error;await b.auditAccess?.("UPDATE","participants",id,{action:"CARE_PLAN_APPROVED"});toast("Care plan approved");setTimeout(()=>window.FlorenceRefresh?.()||location.reload(),400);
}
function makeButton(id,label,kind,handler){const button=document.createElement("button");button.id=id;button.type="button";button.className=`${kind} participant-control`;button.textContent=label;button.onclick=e=>{e.preventDefault();e.stopPropagation();button.disabled=true;void handler().catch(error=>toast(error?.message||"Florence could not complete that action.")).finally(()=>button.disabled=false)};return button}
function ensureControls(){
 const host=q("#pf-content")||q("#participant-file-content");if(!host)return;
 if(!isSupervisor()){q("#edit-participant-details",host)?.remove();q("#approve-care-plan",host)?.remove();return}
 const hero=q(".pf-hero",host)||q(".participant-file-hero",host);
 if(hero&&!q("#edit-participant-details",hero)){
  let actions=q(".participant-native-actions",hero);if(!actions){actions=document.createElement("div");actions.className="participant-native-actions";hero.appendChild(actions)}
  actions.appendChild(makeButton("edit-participant-details","Edit participant","secondary",openEditor));
 }
 const careActive=q('[data-pf-tab="care"].active')||q('[data-pf-tab="care-plan"].active')||q('[data-participant-file-tab="care-plan"].active');
 if(careActive){const body=q(".pf-body",host)||q(".participant-file-tab-content",host)||host;if(/Approval pending/i.test(body.textContent||"")&&!q("#approve-care-plan",body)){const bar=q(".pf-actions",body)||body;bar.appendChild(makeButton("approve-care-plan","Approve care plan","primary",approvePlan))}}
}
const observer=new MutationObserver(ensureControls);
function start(){const host=q("#pf-content")||q("#participant-file-content");if(host&&!host.__participantControlsObserved){observer.observe(host,{childList:true,subtree:true});host.__participantControlsObserved=true}ensureControls()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("florence:ready",start);window.addEventListener("pageshow",start);document.addEventListener("click",event=>{const target=event.target instanceof Element?event.target:null;if(target?.closest('[data-view="participants"],[data-pf-tab]'))setTimeout(start,80)});
const style=document.createElement("style");style.textContent='.participant-native-actions{display:flex;flex-direction:column;align-items:flex-end;gap:8px}.pf-hero .participant-control,.participant-file-hero .participant-control{background:#fff!important;color:#315d46!important;border-color:#fff!important;white-space:nowrap}.pf-actions .participant-control{margin-left:auto}@media(max-width:560px){.participant-native-actions{align-items:flex-end}.participant-control{padding:10px 13px;font-size:.9rem}}';document.head.appendChild(style);
})();
