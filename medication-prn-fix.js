(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=s=>document.querySelector(s);
function bind(){
 const bridge=B(),button=q("#add-med");
 if(!bridge?.profile||!button||button.dataset.prnFixBound)return false;
 button.dataset.prnFixBound="true";
 button.onclick=()=>bridge.form("Add medication profile",[
  bridge.field("participant_id","Participant","select",bridge.state.participants.map(p=>({value:p.id,label:p.full_name}))),
  bridge.field("medication_name","Medication name"),
  bridge.field("dose","Dose"),
  bridge.field("route","Route","select",["Oral","Topical","Inhaled","Subcutaneous","Other"]),
  bridge.field("medication_type","Type","select",["Regular","PRN","Schedule 8"]),
  bridge.field("administration_time","Administration time (leave blank for PRN)","time",[],false),
  bridge.field("prn_indication","PRN indication (required for PRN)","textarea",[],false),
  bridge.field("max_prn_dose","Maximum PRN dose (required for PRN)","text",[],false),
  bridge.field("hold_from","Hold from (optional)","date",[],false),
  bridge.field("hold_until","Hold until (optional)","date",[],false),
  bridge.field("ceased_at","Ceased date (optional)","date",[],false),
  bridge.field("instructions","Administration instructions (optional)","textarea",[],false)
 ],async values=>{
  const type=String(values.medication_type||"").trim();
  if(!["Regular","PRN","Schedule 8"].includes(type))throw new Error("Choose Regular, PRN or Schedule 8");
  if(type==="PRN"){
   values.administration_time="";
   if(!String(values.prn_indication||"").trim())throw new Error("Enter the reason or indication for this PRN medication");
   if(!String(values.max_prn_dose||"").trim())throw new Error("Enter the maximum PRN dose");
  }else{
   values.prn_indication="";
   values.max_prn_dose="";
  }
  const payload={organisation_id:bridge.profile.organisation_id,active:!values.ceased_at,created_by:bridge.profile.id,...values,medication_type:type};
  for(const key of ["administration_time","prn_indication","max_prn_dose","hold_from","hold_until","ceased_at","instructions"]){if(!payload[key])payload[key]=null}
  const {data,error}=await bridge.db.from("medications").insert(payload).select("id,medication_type").single();
  if(error)throw error;
  if(data.medication_type!==type)throw new Error("Florence could not save the selected medication type");
  location.reload();
  return `${type} medication added`;
 });
 return true;
}
window.addEventListener("florence:ready",bind);
let attempts=0;const timer=setInterval(()=>{attempts++;if(bind()||attempts>30)clearInterval(timer)},300);
})();
