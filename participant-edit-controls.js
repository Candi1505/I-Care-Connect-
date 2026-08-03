(()=>{
"use strict";
const q=(selector,root=document)=>root.querySelector(selector);
const B=()=>window.FlorenceBridge;
let adding=false;

function toast(message){
 const bridge=B();
 if(bridge?.toast)return bridge.toast(message);
 const element=q("#toast");
 if(!element)return;
 element.textContent=message;
 element.classList.add("show");
 setTimeout(()=>element.classList.remove("show"),2600);
}

function currentParticipantId(){
 return q("#pf-select")?.value||"";
}

async function openEditor(){
 const bridge=B();
 if(!bridge?.db||!bridge?.profile)throw new Error("Florence is still loading your secure account.");
 if(bridge.profile.role!=="supervisor")throw new Error("Only supervisors can edit participant details.");
 const participantId=currentParticipantId();
 if(!participantId)throw new Error("Choose a participant first.");
 const {data:participant,error}=await bridge.db.from("participants").select("*").eq("id",participantId).single();
 if(error||!participant)throw error||new Error("Participant record not found.");
 const field=bridge.field;
 const fields=[
  field("full_name","Full legal name","text",[],true),
  field("preferred_name","Preferred name","text",[],false),
  field("date_of_birth","Date of birth","date",[],false),
  field("ndis_number","NDIS number","text",[],false),
  field("address","Residential address","textarea",[],false),
  field("phone","Participant phone","text",[],false),
  field("emergency_contact","Emergency contact details","textarea",[],false),
  field("guardian_nominee","Guardian or nominee","textarea",[],false),
  field("gp","GP / doctor details","textarea",[],false),
  field("pharmacy","Pharmacy details","textarea",[],false),
  field("communication_needs","Communication needs","textarea",[],false),
  field("diagnoses","Diagnoses","textarea",[],false),
  field("allergies","Allergies","textarea",[],false),
  field("goals","Goals","textarea",[],false),
  field("preferences","Preferences and routines","textarea",[],false),
  field("risks_and_safeguards","Risks and safeguards","textarea",[],false)
 ];
 const values={};
 for(const key of ["full_name","preferred_name","date_of_birth","ndis_number","address","phone","emergency_contact","guardian_nominee","gp","pharmacy","communication_needs","diagnoses","allergies","goals","preferences","risks_and_safeguards"]){
  values[key]=participant[key]??"";
 }
 bridge.form(`Edit ${participant.preferred_name||participant.full_name}`,fields,async values=>{
  const payload={
   full_name:String(values.full_name||"").trim(),
   preferred_name:String(values.preferred_name||"").trim()||null,
   date_of_birth:values.date_of_birth||null,
   ndis_number:String(values.ndis_number||"").trim()||null,
   address:String(values.address||"").trim()||null,
   phone:String(values.phone||"").trim()||null,
   emergency_contact:String(values.emergency_contact||"").trim()||null,
   guardian_nominee:String(values.guardian_nominee||"").trim()||null,
   gp:String(values.gp||"").trim()||null,
   pharmacy:String(values.pharmacy||"").trim()||null,
   communication_needs:String(values.communication_needs||"").trim()||null,
   diagnoses:String(values.diagnoses||"").trim()||null,
   allergies:String(values.allergies||"").trim()||null,
   goals:String(values.goals||"").trim()||null,
   preferences:String(values.preferences||"").trim()||null,
   risks_and_safeguards:String(values.risks_and_safeguards||"").trim()||null,
   updated_at:new Date().toISOString()
  };
  if(!payload.full_name)throw new Error("Full legal name is required.");
  const {error:updateError}=await bridge.db.from("participants").update(payload).eq("id",participantId);
  if(updateError)throw updateError;
  setTimeout(()=>{
   const refresh=window.FlorenceRefresh;
   if(typeof refresh==="function")void refresh();
   else location.reload();
  },500);
  return "Participant details updated";
 },values);
}

function ensureButton(){
 if(adding)return;
 const bridge=B();
 const hero=q("#pf-content .pf-hero");
 if(!hero||!bridge?.profile)return;
 const existing=q("#edit-participant-details",hero);
 if(bridge.profile.role!=="supervisor"){
  existing?.remove();
  return;
 }
 if(existing)return;
 adding=true;
 try{
  const actionArea=hero.lastElementChild||hero;
  const button=document.createElement("button");
  button.id="edit-participant-details";
  button.type="button";
  button.className="secondary pf-edit-participant";
  button.textContent="Edit participant";
  button.addEventListener("click",event=>{
   event.preventDefault();
   event.stopPropagation();
   button.disabled=true;
   void openEditor().catch(error=>toast(error?.message||"Florence could not open participant editing.")).finally(()=>{button.disabled=false});
  });
  actionArea.appendChild(button);
 }finally{adding=false}
}

const observer=new MutationObserver(()=>ensureButton());
function start(){
 const host=q("#pf-content");
 if(host&&!host.__participantEditObserved){
  observer.observe(host,{childList:true,subtree:true});
  host.__participantEditObserved=true;
 }
 ensureButton();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("florence:ready",start);
window.addEventListener("pageshow",start);
setInterval(start,1200);
const style=document.createElement("style");
style.textContent=`.pf-hero>div:last-child{display:flex;flex-direction:column;align-items:flex-end;gap:10px}.pf-edit-participant{background:#fff;color:#315d46;border-color:rgba(255,255,255,.7);white-space:nowrap}@media(max-width:560px){.pf-hero{align-items:flex-start}.pf-hero>div:last-child{align-items:flex-end}.pf-edit-participant{padding:10px 13px;font-size:.9rem}}`;
document.head.appendChild(style);
})();