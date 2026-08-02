(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const clean=v=>String(v??"").trim();
const fridayFor=value=>{
 const d=value?new Date(`${value}T12:00:00`):new Date();
 const day=d.getDay(),distance=(5-day+7)%7;
 d.setDate(d.getDate()+distance);
 return d.toISOString().slice(0,10);
};
function waitForBridge(callback){
 if(B()?.profile)return void callback();
 let tries=0;
 const timer=setInterval(()=>{if(B()?.profile||tries++>80){clearInterval(timer);if(B()?.profile)callback()}},250);
}
function medByCard(card){
 const name=clean(q("h3",card)?.textContent);
 const participant=clean(q(".record-top p",card)?.textContent);
 return B().state.medications.find(m=>clean(m.medication_name)===name&&clean(m.participant?.full_name)===participant)
  ||B().state.medications.find(m=>clean(m.medication_name)===name);
}
function addMedicationControls(){
 if(!B()?.isSupervisor())return;
 const host=q("#med-content");if(!host)return;
 qa(":scope > article.record",host).forEach(card=>{
  if(q("[data-edit-medication]",card))return;
  const med=medByCard(card);if(!med)return;
  const row=document.createElement("div");row.className="record-meta medication-maintenance-actions";
  row.innerHTML=`<button type="button" class="link" data-edit-medication="${med.id}">Edit profile</button><button type="button" class="link" data-hold-medication="${med.id}">${med.hold_from||med.hold_until?"Change hold":"Place on hold"}</button><button type="button" class="decline" data-cease-medication="${med.id}">${med.ceased_at||!med.active?"Ceased":"Cease medication"}</button>`;
  card.appendChild(row);
 });
}
function medicationFields(){
 const {field}=B();
 return [
  field("medication_name","Medication name"),field("dose","Dose"),field("route","Route","select",["Oral","Topical","Inhaled","Subcutaneous","Other"]),
  field("administration_time","Administration time (blank for PRN)","time",[],false),field("medication_type","Type","select",["Regular","PRN","Schedule 8"]),
  field("prn_indication","PRN indication","textarea",[],false),field("max_prn_dose","Maximum PRN dose","text",[],false),field("instructions","Administration instructions","textarea",[],false)
 ];
}
function openMedicationEdit(med){
 B().form("Edit medication profile",medicationFields(),async values=>{
  const type=clean(values.medication_type);
  if(type==="PRN"){
   values.administration_time=null;
   if(!clean(values.prn_indication))throw new Error("Add the reason or symptoms this PRN medication may be given for");
   if(!clean(values.max_prn_dose))throw new Error("Add the maximum PRN dose or frequency");
  }else{
   values.prn_indication=null;values.max_prn_dose=null;
   if(type==="Regular"&&!values.administration_time)throw new Error("Regular medication needs an administration time");
  }
  const payload={...values,updated_at:new Date().toISOString()};
  Object.keys(payload).forEach(key=>{if(payload[key]==="")payload[key]=null});
  const {data,error}=await B().db.from("medications").update(payload).eq("id",med.id).select("id,medication_type,administration_time").single();
  if(error)throw error;
  if(data.medication_type!==type)throw new Error("Florence could not verify the medication type after saving");
  await B().refreshAll();addMedicationControls();
  return "Medication profile updated with an audit record";
 },med);
}
function openMedicationHold(med){
 const {field}=B();
 B().form("Medication hold",[
  field("hold_from","Hold from","date",[],false),field("hold_until","Hold until","date",[],false),field("instructions","Updated administration instructions","textarea",[],false)
 ],async values=>{
  if(values.hold_from&&values.hold_until&&values.hold_until<values.hold_from)throw new Error("Hold-until date cannot be before the hold-from date");
  const {error}=await B().db.from("medications").update({hold_from:values.hold_from||null,hold_until:values.hold_until||null,instructions:values.instructions||med.instructions||null,updated_at:new Date().toISOString()}).eq("id",med.id);
  if(error)throw error;await B().refreshAll();addMedicationControls();return values.hold_from?"Medication hold updated":"Medication hold removed";
 },med);
}
async function ceaseMedication(med){
 const reason=prompt("Reason for ceasing this medication");if(!clean(reason))return;
 const date=new Date().toISOString().slice(0,10);
 const instructions=[clean(med.instructions),`Ceased ${date}: ${clean(reason)}`].filter(Boolean).join("\n");
 const {error}=await B().db.from("medications").update({active:false,ceased_at:date,instructions,updated_at:new Date().toISOString()}).eq("id",med.id);
 if(error)throw error;await B().refreshAll();addMedicationControls();B().toast("Medication ceased and retained in the medication profile history");
}
async function renderAmendments(){
 if(!B()?.isStaffUser())return;
 const host=q("#note-list");if(!host)return;
 const ids=B().state.notes.map(n=>n.id);
 let amendments=[];
 if(ids.length){const {data}=await B().db.from("progress_note_amendments").select("id,progress_note_id,amendment,created_at,author_id").in("progress_note_id",ids).order("created_at");amendments=data||[]}
 qa(":scope > article.record",host).forEach((card,index)=>{
  const note=B().state.notes[index];if(!note)return;
  q(".progress-note-amendments",card)?.remove();
  const box=document.createElement("div");box.className="progress-note-amendments record-meta";
  const rows=amendments.filter(a=>a.progress_note_id===note.id);
  box.innerHTML=`${rows.map(a=>`<div class="notice"><strong>Amendment · ${B().fmt(a.created_at)}</strong><br>${B().esc(a.amendment)}</div>`).join("")}${B().isSupervisor()?`<button type="button" class="link" data-amend-note="${note.id}">Add auditable amendment</button>`:""}`;
  card.appendChild(box);
 });
}
function addWeeklyUpdateButton(){
 if(!B()?.isStaffUser())return;
 const head=q("#portal-view .page-head");if(!head||q("#create-weekly-family-update"))return;
 const button=document.createElement("button");button.id="create-weekly-family-update";button.type="button";button.className="secondary";button.textContent="+ Weekly family update";
 const actions=q(".actions",head);(actions||head).appendChild(button);
 button.onclick=openWeeklyUpdate;
}
function openWeeklyUpdate(){
 const {field}=B();
 const defaultParticipant=B().state.participants[0]?.id||"";
 B().form("Weekly family update",[
  field("participant_id","Participant","select",B().state.participants.map(p=>({value:p.id,label:p.preferred_name||p.full_name}))),
  field("week_ending","Week ending Friday","date"),field("health_wellbeing","Health and wellbeing","textarea",[],false),
  field("activities_appointments","Activities and appointments","textarea",[],false),field("goals_progress","Goals and progress","textarea",[],false),
  field("medication_clinical_updates","Medication or clinical updates","textarea",[],false),field("concerns_follow_up","Concerns and follow-up","textarea",[],false)
 ],async values=>{
  values.week_ending=fridayFor(values.week_ending);
  if(![values.health_wellbeing,values.activities_appointments,values.goals_progress,values.medication_clinical_updates,values.concerns_follow_up].some(clean))throw new Error("Record at least one meaningful weekly update");
  let thread=B().state.portalThreads.find(t=>t.participant_id===values.participant_id&&clean(t.subject).toLowerCase()==="weekly family updates");
  if(!thread){
   const {data,error}=await B().db.from("portal_threads").insert({organisation_id:B().profile.organisation_id,participant_id:values.participant_id,thread_type:"Information update",subject:"Weekly family updates",status:"Open",created_by:B().profile.id}).select().single();
   if(error)throw error;thread=data;
  }
  const sections=[
   ["Health and wellbeing",values.health_wellbeing],["Activities and appointments",values.activities_appointments],["Goals and progress",values.goals_progress],
   ["Medication or clinical updates",values.medication_clinical_updates],["Concerns and follow-up",values.concerns_follow_up]
  ].filter(([,v])=>clean(v));
  const message=`Weekly update — week ending ${values.week_ending}\n\n${sections.map(([h,v])=>`${h}:\n${clean(v)}`).join("\n\n")}`;
  const {data:posted,error:messageError}=await B().db.from("portal_messages").insert({organisation_id:B().profile.organisation_id,thread_id:thread.id,sender_id:B().profile.id,message}).select().single();
  if(messageError)throw messageError;
  const {error:updateError}=await B().db.from("weekly_family_updates").upsert({organisation_id:B().profile.organisation_id,participant_id:values.participant_id,week_ending:values.week_ending,health_wellbeing:clean(values.health_wellbeing)||null,activities_appointments:clean(values.activities_appointments)||null,goals_progress:clean(values.goals_progress)||null,medication_clinical_updates:clean(values.medication_clinical_updates)||null,concerns_follow_up:clean(values.concerns_follow_up)||null,completed_by:B().profile.id,completed_at:new Date().toISOString(),portal_thread_id:thread.id,portal_message_id:posted.id},{onConflict:"participant_id,week_ending"});
  if(updateError)throw updateError;await B().refreshAll();return "Weekly family update saved and shared in the portal";
 },{participant_id:defaultParticipant,week_ending:fridayFor()});
}
document.addEventListener("click",async event=>{
 try{
  let button=event.target.closest("[data-edit-medication]");if(button){const med=B().state.medications.find(m=>m.id===button.dataset.editMedication);if(med)openMedicationEdit(med);return}
  button=event.target.closest("[data-hold-medication]");if(button){const med=B().state.medications.find(m=>m.id===button.dataset.holdMedication);if(med)openMedicationHold(med);return}
  button=event.target.closest("[data-cease-medication]");if(button){const med=B().state.medications.find(m=>m.id===button.dataset.ceaseMedication);if(med&&!med.ceased_at&&med.active&&confirm(`Cease ${med.medication_name}?`))await ceaseMedication(med);return}
  button=event.target.closest("[data-amend-note]");if(button){const amendment=prompt("Record the correction or additional information. The original note will remain unchanged.");if(!clean(amendment))return;const {error}=await B().db.from("progress_note_amendments").insert({progress_note_id:button.dataset.amendNote,author_id:B().profile.id,amendment:clean(amendment)});if(error)throw error;await renderAmendments();return B().toast("Progress-note amendment recorded")}
 }catch(error){B().toast(error.message||"Florence could not complete that change")}
});
function installObservers(){
 const med=q("#med-content"),notes=q("#note-list");
 if(med)new MutationObserver(addMedicationControls).observe(med,{childList:true,subtree:false});
 if(notes)new MutationObserver(()=>void renderAmendments()).observe(notes,{childList:true,subtree:false});
 addMedicationControls();void renderAmendments();addWeeklyUpdateButton();
}
window.addEventListener("florence:ready",installObservers,{once:true});
waitForBridge(installObservers);
})();
