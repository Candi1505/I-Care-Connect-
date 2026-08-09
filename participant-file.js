(()=>{
"use strict";
const q=(selector,root=document)=>root.querySelector(selector);
const B=()=>window.FlorenceBridge;
let busy=false;
function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
function participantId(){return q("#pf-select")?.value||""}
async function openEditor(){
 const b=B();
 if(!b?.db||!b?.profile)throw new Error("Florence is still loading your secure account.");
 if(b.profile.role!=="supervisor")throw new Error("Only supervisors can edit participant details.");
 const id=participantId();if(!id)throw new Error("Choose a participant first.");
 const {data:p,error}=await b.db.from("participants").select("*").eq("id",id).single();
 if(error||!p)throw error||new Error("Participant record not found.");
 const f=b.field;
 const fields=[
  f("full_name","Full legal name"),f("preferred_name","Preferred name","text",[],false),f("date_of_birth","Date of birth","date",[],false),
  f("ndis_number","NDIS number","text",[],false),f("address","Residential address","textarea",[],false),f("phone","Participant phone","text",[],false),
  f("emergency_contact","Emergency contact details","textarea",[],false),f("guardian_nominee","Guardian or nominee","textarea",[],false),
  f("gp","GP / doctor details","textarea",[],false),f("pharmacy","Pharmacy details","textarea",[],false),
  f("communication_needs","Communication needs","textarea",[],false),f("diagnoses","Diagnoses","textarea",[],false),
  f("allergies","Allergies","textarea",[],false),f("goals","Goals","textarea",[],false),
  f("preferences","Preferences and routines","textarea",[],false),f("risks_and_safeguards","Risks and safeguards","textarea",[],false)
 ];
 const values={};for(const key of ["full_name","preferred_name","date_of_birth","ndis_number","address","phone","emergency_contact","guardian_nominee","gp","pharmacy","communication_needs","diagnoses","allergies","goals","preferences","risks_and_safeguards"])values[key]=p[key]??"";
 b.form(`Edit ${p.preferred_name||p.full_name}`,fields,async v=>{
  const payload={updated_at:new Date().toISOString()};
  for(const key of Object.keys(values))payload[key]=String(v[key]??"").trim()||null;
  payload.date_of_birth=v.date_of_birth||null;
  if(!payload.full_name)throw new Error("Full legal name is required.");
  const {error:updateError}=await b.db.from("participants").update(payload).eq("id",id);
  if(updateError)throw updateError;
  setTimeout(()=>window.FlorenceRefresh?void window.FlorenceRefresh():location.reload(),400);
  return "Participant details updated";
 },values);
}
function ensure(){
 const b=B(),hero=q("#pf-content .pf-hero");
 if(!hero||!b?.profile)return;
 const existing=q("#edit-participant-details",hero);
 if(b.profile.role!=="supervisor"){existing?.remove();return}
 if(existing||busy)return;
 busy=true;
 const holder=hero.lastElementChild||hero;
 const button=document.createElement("button");
 button.id="edit-participant-details";button.type="button";button.className="secondary";button.textContent="Edit participant";
 button.style.cssText="background:#fff;color:#315d46;border-color:rgba(255,255,255,.7);white-space:nowrap;margin-top:10px";
 button.onclick=event=>{event.preventDefault();event.stopPropagation();void openEditor().catch(error=>toast(error?.message||"Florence could not open participant editing."))};
 holder.appendChild(button);busy=false;
}
function start(){ensure();const host=q("#pf-content");if(host&&!host.__editObserved){new MutationObserver(ensure).observe(host,{childList:true,subtree:true});host.__editObserved=true}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("pageshow",start);window.addEventListener("florence:ready",start);document.addEventListener("click",event=>{const target=event.target instanceof Element?event.target:null;if(target?.closest('[data-view="participants"],[data-pf-tab]'))setTimeout(start,80)});
})();
