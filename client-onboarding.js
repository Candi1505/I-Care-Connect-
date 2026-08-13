(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=(selector,root=document)=>root.querySelector(selector);
const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[character]));
const SERVICES=[
 {value:"Domestic assistance",label:"Domestic duties",description:"Cleaning, laundry and other agreed household tasks."},
 {value:"Personal care",label:"Personal care",description:"Approved personal care supports."},
 {value:"Community access",label:"Community access",description:"Approved community participation supports."},
 {value:"Social support",label:"Social support",description:"Approved social support activities."},
 {value:"Transport",label:"Transport",description:"Approved participant transport."},
 {value:"Sleepover",label:"Sleepover",description:"Approved overnight sleepover support."},
 {value:"24-hour support",label:"24-hour support",description:"Approved continuous or SIL-style support."},
 {value:"Medication support",label:"Medication support",description:"Medication profiles, MAR and medication-related notes."}
];
const SHIFT_SERVICES=SERVICES.filter(service=>service.value!=="Medication support");
const ALL_NOTE_CATEGORIES=["Daily support","Domestic assistance","Personal care","Community access","Health","Communication","Goals and outcomes","Behaviour observation"];
let scopes=[],assignments=[],loading=null;

function bridge(){const value=B();if(!value?.db||!value?.profile)throw new Error("Florence is still loading your secure account.");return value}
function serviceLabel(value){return SERVICES.find(service=>service.value===value)?.label||value}
function participantById(id){return bridge().state.participants.find(participant=>participant.id===id)}
function activeScopes(participantId){const today=new Date().toISOString().slice(0,10);return scopes.filter(scope=>scope.participant_id===participantId&&scope.active&&(!scope.starts_on||scope.starts_on<=today)&&(!scope.ends_on||scope.ends_on>=today))}
function participantServices(participant){if(!participant)return[];if(!participant.service_scope_confirmed_at)return SERVICES.map(service=>service.value);return activeScopes(participant.id).map(scope=>scope.service_type)}
function allows(participant,serviceType){return participantServices(participant).includes(serviceType)}
function scopeConfirmed(participant){return Boolean(participant?.service_scope_confirmed_at)}
function serviceOptions(participant,includeMedication=false){const allowed=new Set(participantServices(participant));return (includeMedication?SERVICES:SHIFT_SERVICES).filter(service=>allowed.has(service.value))}
function scopePicker(selected=[]){const chosen=new Set(selected);return `<fieldset class="service-scope-picker"><legend>Approved I-Care Connect services</legend><p class="record-meta">Choose only services covered by the participant's agreement. Florence will block other rostering, medication and invoicing activity.</p>${SERVICES.map(service=>`<label><input type="checkbox" name="service_types" value="${esc(service.value)}" ${chosen.has(service.value)?"checked":""}><span><strong>${esc(service.label)}</strong><small>${esc(service.description)}</small></span></label>`).join("")}</fieldset>`}
function selectOptions(items){return items.map(item=>({value:item.value,label:item.label}))}

async function load(){
 const b=bridge();
 const scopeQuery=b.db.from("participant_service_scopes").select("id,organisation_id,participant_id,service_type,active,starts_on,ends_on,confirmed_by,updated_at").eq("organisation_id",b.profile.organisation_id);
 const assignmentQuery=b.isSupervisor()?b.db.from("participant_access_assignments").select("participant_id,staff_id,active,revoked_at").eq("organisation_id",b.profile.organisation_id).eq("active",true).is("revoked_at",null):Promise.resolve({data:[],error:null});
 const [scopeResult,assignmentResult]=await Promise.all([scopeQuery,assignmentQuery]);
 if(scopeResult.error)throw scopeResult.error;
 if(assignmentResult.error)throw assignmentResult.error;
 scopes=scopeResult.data||[];
 assignments=assignmentResult.data||[];
 b.state.serviceScopes=scopes;
 render();
 return scopes;
}
function refresh(){if(loading)return loading;loading=load().finally(()=>{loading=null});return loading}

function participantFields(b){return[
 b.field("full_name","Full legal name"),
 b.field("preferred_name","Preferred name (optional)","text",[],false),
 b.field("date_of_birth","Date of birth (optional)","date",[],false),
 b.field("ndis_number","NDIS number (optional)","text",[],false),
 scopePicker(),
 b.field("address","Address (optional)","text",[],false),
 b.field("phone","Phone (optional)","tel",[],false),
 b.field("emergency_contact","Emergency contact (optional)","text",[],false),
 b.field("guardian_nominee","Guardian or nominee (optional)","text",[],false),
 b.field("gp","GP (optional)","text",[],false),
 b.field("pharmacy","Pharmacy (optional)","text",[],false),
 b.field("communication_needs","Communication needs (optional)","textarea",[],false),
 b.field("diagnoses","Diagnoses (optional)","textarea",[],false),
 b.field("allergies","Allergies (optional)","textarea",[],false),
 b.field("goals","Goals (optional)","textarea",[],false),
 b.field("preferences","Preferences (optional)","textarea",[],false),
 b.field("risks_and_safeguards","Risks and safeguards (optional)","textarea",[],false),
 b.field("funding_start","Funding start (optional)","date",[],false),
 b.field("funding_end","Funding end (optional)","date",[],false)
 ]}

function bindParticipantOnboarding(){
 const button=q("#add-participant"),b=B();if(!button||!b?.isSupervisor())return;
 button.onclick=()=>b.form("Onboard participant",participantFields(b),async(values,formData)=>{
  const serviceTypes=formData.getAll("service_types").map(String);
  if(!serviceTypes.length)throw new Error("Choose at least one approved service");
  const payload={...values};delete payload.service_types;
  const {error}=await b.db.rpc("create_participant_with_services",{p_participant:payload,p_service_types:serviceTypes});
  if(error)throw error;
  await b.refreshAll();await refresh();
  return "Participant onboarded with approved services";
 });
}

function updateDependentSelect(participantSelect,targetSelect,kind){
 const participant=participantById(participantSelect.value);
 let items=[];
 if(kind==="shift")items=serviceOptions(participant,false);
 if(kind==="note"){
  const services=new Set(participantServices(participant));
  const categories=new Set(["Daily support","Communication","Goals and outcomes"]);
  if(services.has("Domestic assistance"))categories.add("Domestic assistance");
  if(services.has("Personal care"))categories.add("Personal care");
  if(services.has("Community access"))categories.add("Community access");
  if(services.has("Medication support"))categories.add("Health");
  if(["24-hour support","Personal care","Community access","Social support"].some(service=>services.has(service)))categories.add("Behaviour observation");
  items=ALL_NOTE_CATEGORIES.filter(category=>categories.has(category)).map(value=>({value,label:serviceLabel(value)}));
 }
 targetSelect.innerHTML=items.map(item=>`<option value="${esc(item.value)}">${esc(item.label)}</option>`).join("");
 targetSelect.disabled=!items.length;
}

function bindRoster(){
 const button=q("#add-shift"),b=B();if(!button||!b?.isSupervisor())return;
 button.onclick=()=>{
  const participants=b.state.participants;
  if(!participants.length)return b.toast("Add a participant before creating a shift");
  b.form("Create roster shift",[
   b.field("participant_id","Participant","select",participants.map(participant=>({value:participant.id,label:participant.full_name}))),
   b.field("assigned_staff_id","Assigned worker (optional — leave blank to broadcast)","select",[{value:"",label:"Open shift — any worker can claim"},...b.state.staff.filter(person=>["staff","supervisor"].includes(person.role)).map(person=>({value:person.id,label:person.full_name}))],false),
   b.field("starts_at","Start","datetime-local"),b.field("ends_at","Finish","datetime-local"),
   b.field("shift_type","Approved service","select",selectOptions(serviceOptions(participants[0],false))),
   b.field("repeat_weeks","Repeat for number of weeks (optional)","number",[],false),
   b.field("status","Save as","select",["Draft","Published"]),
   b.field("instructions","Shift instructions (optional)","textarea",[],false),
   b.field("handover_notes","Handover information (optional)","textarea",[],false)
  ],async values=>{
   const participant=participantById(values.participant_id);
   if(!allows(participant,values.shift_type))throw new Error(`${serviceLabel(values.shift_type)} is not approved for this participant`);
   const starts=new Date(values.starts_at),ends=new Date(values.ends_at);if(ends<=starts)throw new Error("Shift finish must be after its start");
   const count=Math.min(52,Math.max(1,Number(values.repeat_weeks||1))),group=count>1?crypto.randomUUID():null,rows=[];
   for(let week=0;week<count;week++){
    const shiftStart=new Date(starts.getTime()+week*7*86400000),shiftEnd=new Date(ends.getTime()+week*7*86400000);
    if(values.assigned_staff_id&&b.state.shifts.some(shift=>shift.assigned_staff_id===values.assigned_staff_id&&shift.status!=="Cancelled"&&new Date(shift.starts_at)<shiftEnd&&new Date(shift.ends_at)>shiftStart))throw new Error(`Roster conflict in week ${week+1}: this worker already has an overlapping shift`);
    rows.push({organisation_id:b.profile.organisation_id,participant_id:values.participant_id,assigned_staff_id:values.assigned_staff_id||null,starts_at:shiftStart.toISOString(),ends_at:shiftEnd.toISOString(),shift_type:values.shift_type,status:values.status,response:values.status==="Published"?"Pending":"Not sent",instructions:values.instructions||null,handover_notes:values.handover_notes||null,recurrence_group:group,created_by:b.profile.id,published_at:values.status==="Published"?new Date().toISOString():null});
   }
   const {error}=await b.db.from("shifts").insert(rows);if(error)throw error;await b.refreshAll();return count>1?`${count} approved-service shifts created`:values.status==="Published"?"Shift published":"Draft saved";
  });
  const participantSelect=q('#dialog-fields [name="participant_id"]'),serviceSelect=q('#dialog-fields [name="shift_type"]');
  participantSelect?.addEventListener("change",()=>updateDependentSelect(participantSelect,serviceSelect,"shift"));
 };
}

function bindNotes(){
 const button=q("#add-note"),b=B();if(!button||!b?.isStaffUser())return;
 button.onclick=()=>{
  const participants=b.state.participants;if(!participants.length)return b.toast("You do not currently have access to a participant");
  const initialCategories=document.createElement("select");updateDependentSelect({value:participants[0].id},initialCategories,"note");
  const options=[...initialCategories.options].map(option=>option.value);
  b.form("Create progress note",[
   b.field("participant_id","Participant","select",participants.map(participant=>({value:participant.id,label:participant.full_name}))),
   b.field("category","Note type","select",options.map(value=>({value,label:serviceLabel(value)}))),
   b.field("content","What support was provided and what was the outcome?","textarea"),
   b.field("status","Save note as","select",["Final","Draft"]),
   `<label class="truth-declaration"><input name="declaration_confirmed" type="checkbox" value="true" required><span>I declare that the information I have recorded is true and correct.</span></label>`,
   b.field("progress_note_pin","Your personal 6-digit PIN","password")
  ],async values=>{
   if(values.declaration_confirmed!=="true")throw new Error("Tick the declaration confirming your progress note is true and correct");
   if(!/^\d{6}$/.test(values.progress_note_pin||""))throw new Error("Enter your six-digit PIN");
   const participant=participantById(values.participant_id),specific={"Domestic assistance":"Domestic assistance","Personal care":"Personal care","Community access":"Community access","Health":"Medication support"}[values.category];
   if(specific&&!allows(participant,specific))throw new Error(`${serviceLabel(specific)} is not approved for this participant`);
   const {error}=await b.db.rpc("record_progress_note",{p_participant_id:values.participant_id,p_category:values.category,p_content:values.content,p_status:values.status,p_pin:values.progress_note_pin,p_declaration_confirmed:true});
   if(error)throw error;await b.refreshAll();return "Progress note declared, PIN verified and saved";
  });
  const participantSelect=q('#dialog-fields [name="participant_id"]'),categorySelect=q('#dialog-fields [name="category"]');
  participantSelect?.addEventListener("change",()=>updateDependentSelect(participantSelect,categorySelect,"note"));
 };
}

function bindMedication(){
 const button=q("#add-med"),b=B();if(!button||!b?.isSupervisor())return;
 button.onclick=()=>{
  const participants=b.state.participants.filter(participant=>allows(participant,"Medication support"));
  if(!participants.length)return b.toast("No participant currently has Medication support in their approved service scope");
  b.form("Add medication profile",[
   b.field("participant_id","Participant","select",participants.map(participant=>({value:participant.id,label:participant.full_name}))),
   b.field("medication_name","Medication name"),b.field("dose","Dose"),b.field("route","Route","select",["Oral","Topical","Inhaled","Subcutaneous","Other"]),
   b.field("administration_time","Administration time (optional for PRN)","time",[],false),b.field("medication_type","Type","select",["Regular","PRN","Schedule 8"]),
   b.field("prn_indication","PRN indication (optional)","textarea",[],false),b.field("max_prn_dose","Maximum PRN dose (optional)","text",[],false),
   b.field("hold_from","Hold from (optional)","date",[],false),b.field("hold_until","Hold until (optional)","date",[],false),b.field("ceased_at","Ceased date (optional)","date",[],false),
   b.field("instructions","Administration instructions (optional)","textarea",[],false)
  ],async values=>{
   const participant=participantById(values.participant_id);if(!allows(participant,"Medication support"))throw new Error("Medication support is not approved for this participant");
   const payload={organisation_id:b.profile.organisation_id,active:!values.ceased_at,created_by:b.profile.id,...values};
   for(const key of["administration_time","prn_indication","max_prn_dose","hold_from","hold_until","ceased_at","instructions"])if(!payload[key])payload[key]=null;
   const {error}=await b.db.from("medications").insert(payload);if(error)throw error;await b.refreshAll();return "Medication added";
  });
 };
}

function openServiceEditor(participant){
 const b=bridge(),selected=activeScopes(participant.id).map(scope=>scope.service_type);
 b.form(`Approved services · ${participant.preferred_name||participant.full_name}`,[scopePicker(selected)],async(_values,formData)=>{
  const serviceTypes=formData.getAll("service_types").map(String);if(!serviceTypes.length)throw new Error("Choose at least one approved service");
  const {error}=await b.db.rpc("set_participant_service_scopes",{p_participant_id:participant.id,p_service_types:serviceTypes});if(error)throw error;
  await b.refreshAll();await refresh();return "Approved services updated";
 });
}

function readiness(participant){
 const b=B(),profiles=b.state.staff.filter(person=>person.participant_id===participant.id&&person.active),workerCount=new Set(assignments.filter(assignment=>assignment.participant_id===participant.id).map(assignment=>assignment.staff_id)).size;
 const checks=[
  [scopeConfirmed(participant),"Approved services confirmed"],
  [profiles.some(person=>person.role==="client"),"Participant portal account"],
  [profiles.some(person=>person.role==="family"),"Family representative portal"],
  [workerCount>0,"Ongoing worker access"],
  [Boolean(participant.address&&participant.emergency_contact),"Address and emergency contact"]
 ];
 const ready=checks.filter(([ok])=>ok).length;
 return `<section class="participant-onboarding-readiness"><div class="record-top"><div><strong>Onboarding readiness</strong><p>${ready} of ${checks.length} setup checks complete</p></div><span class="badge ${ready===checks.length?"good":"amber"}">${ready===checks.length?"Ready":"Setup in progress"}</span></div><div class="onboarding-checks">${checks.map(([ok,label])=>`<span class="${ok?"complete":"pending"}">${ok?"✓":"○"} ${esc(label)}</span>`).join("")}</div></section>`;
}

function renderParticipantScope(){
 const b=B(),host=q("#pf-content"),select=q("#pf-select");if(!b?.profile||!host||!select?.value)return;
 const participant=b.state.participants.find(item=>item.id===select.value);if(!participant)return;
 const hero=q(".pf-hero",host);if(!hero)return;
 let summary=q(".participant-service-summary",host);if(!summary){summary=document.createElement("section");summary.className="participant-service-summary";hero.insertAdjacentElement("afterend",summary)}
 const approved=activeScopes(participant.id),labels=approved.map(scope=>serviceLabel(scope.service_type));
 const summarySignature=JSON.stringify([participant.id,participant.service_scope_confirmed_at,labels,b.profile.role]);
 if(summary.dataset.signature!==summarySignature){summary.dataset.signature=summarySignature;summary.innerHTML=`<div><p class="eyebrow">Approved service scope</p><strong>${scopeConfirmed(participant)?labels.join(" · ")||"No current services":"Existing participant — service review required"}</strong><p>${scopeConfirmed(participant)?"Florence blocks services outside this confirmed scope.":"Confirm this participant's services to turn on roster, medication and invoice protection."}</p></div>${b.isSupervisor()?`<button type="button" class="secondary" data-manage-participant-services="${participant.id}">${scopeConfirmed(participant)?"Manage services":"Confirm services"}</button>`:""}`}
 if(b.isSupervisor()){
  const panelSignature=JSON.stringify([participant.id,participant.address,participant.emergency_contact,b.state.staff.filter(person=>person.participant_id===participant.id&&person.active).map(person=>[person.id,person.role]),assignments.filter(assignment=>assignment.participant_id===participant.id).map(assignment=>assignment.staff_id),participant.service_scope_confirmed_at]);
  let panel=q(".participant-onboarding-readiness",host);if(!panel){summary.insertAdjacentHTML("afterend",readiness(participant));panel=q(".participant-onboarding-readiness",host)}
  if(panel?.dataset.signature!==panelSignature){const wrapper=document.createElement("div");wrapper.innerHTML=readiness(participant);const replacement=wrapper.firstElementChild;replacement.dataset.signature=panelSignature;panel?.replaceWith(replacement)}
 }
}

function renderPortalScope(){
 const b=B(),view=q("#portal-view");if(!b?.profile||!view||!["family","client"].includes(b.profile.role))return;
 const participant=b.state.participants.find(item=>item.id===b.profile.participant_id)||b.state.participants[0];if(!participant)return;
 let card=q("#portal-service-scope");if(!card){card=document.createElement("article");card.id="portal-service-scope";card.className="panel portal-service-scope";q("#portal-conversations-section")?.prepend(card)}
 const approved=activeScopes(participant.id),labels=approved.map(scope=>serviceLabel(scope.service_type)),domesticOnly=approved.length===1&&approved[0].service_type==="Domestic assistance";
 card.innerHTML=`<div class="panel-head"><div><p class="eyebrow">I-Care Connect services</p><h3>${b.profile.role==="client"?"Your approved support":`Approved support for ${esc(participant.preferred_name||participant.full_name)}`}</h3><p>${labels.length?esc(labels.join(" · ")):"Your service scope is being confirmed."}</p></div>${scopeConfirmed(participant)?'<span class="badge good">Confirmed</span>':'<span class="badge amber">Being set up</span>'}</div>${domesticOnly?'<p class="service-boundary"><strong>Domestic duties only.</strong> Medication, personal care and other support services are not part of the current I-Care Connect service.</p>':""}`;
}

function render(){renderParticipantScope();renderPortalScope()}
function bind(){bindParticipantOnboarding();bindRoster();bindNotes();bindMedication()}
document.addEventListener("click",event=>{
 const manage=event.target.closest("[data-manage-participant-services]");if(manage){const participant=participantById(manage.dataset.manageParticipantServices);if(participant)openServiceEditor(participant);return}
 if(event.target.closest('[data-view="participants"],[data-view="portal"],[data-pf-tab]'))setTimeout(render,100);
});
const observer=new MutationObserver(()=>render());
function start(){const b=B();if(!b?.db||!b?.profile)return false;bind();void refresh().catch(error=>b.toast(error.message));const participantHost=q("#pf-content");if(participantHost&&!participantHost.__serviceScopeObserved){observer.observe(participantHost,{childList:true,subtree:true});participantHost.__serviceScopeObserved=true}return true}
window.addEventListener("florence:ready",start);
window.addEventListener("pageshow",()=>{if(B()?.profile)void refresh().catch(()=>{})});
const readinessTimer=setInterval(()=>{if(start())clearInterval(readinessTimer)},250);setTimeout(()=>clearInterval(readinessTimer),60000);
window.FlorenceServiceScope={SERVICES,serviceLabel,participantServices,allows,scopeConfirmed,refresh};
const style=document.createElement("style");style.textContent=`.service-scope-picker{border:1px solid rgba(95,143,114,.28);border-radius:18px;padding:14px}.service-scope-picker legend{font-weight:800;color:#315c44;padding:0 6px}.service-scope-picker>label{display:flex;gap:10px;align-items:flex-start;padding:10px;border-radius:12px}.service-scope-picker>label:hover{background:#f2f8f3}.service-scope-picker input{width:22px!important;height:22px!important;flex:0 0 22px;margin-top:1px}.service-scope-picker span,.service-scope-picker small{display:block}.participant-service-summary,.participant-onboarding-readiness{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:15px 17px;border:1px solid rgba(95,143,114,.25);border-radius:17px;background:#f5faf6;margin-top:10px}.participant-service-summary p{margin:3px 0}.participant-onboarding-readiness{display:block;background:#fff}.onboarding-checks{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.onboarding-checks span{padding:7px 10px;border-radius:999px;font-size:.88rem}.onboarding-checks .complete{background:#e7f4ea;color:#285b3d}.onboarding-checks .pending{background:#fff3df;color:#754b14}.portal-service-scope{margin-bottom:16px}.service-boundary{padding:12px 14px;border-radius:14px;background:#f5faf6;margin:0}@media(max-width:700px){.participant-service-summary{align-items:stretch;flex-direction:column}.participant-service-summary button{width:100%}}`;document.head.appendChild(style);
})();
