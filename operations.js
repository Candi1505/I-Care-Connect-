(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=s=>document.querySelector(s);
let ops={incidents:[],complaints:[],medicationIncidents:[],emergencyPlans:[],credentials:[],timesheets:[],availability:[],leave:[],travel:[],goals:[],funding:[],supportItems:[],controlledDrugs:[],notifications:[],audit:[],conflicts:[],meetings:[],delegations:[]};
const tableMap={incidents:"incidents",complaints:"complaints",medicationIncidents:"medication_incidents",emergencyPlans:"emergency_plans",credentials:"staff_credentials",timesheets:"timesheets",availability:"worker_availability",leave:"leave_requests",travel:"travel_expenses",goals:"participant_goals",funding:"funding_plans",supportItems:"ndis_support_items",controlledDrugs:"controlled_drug_register",notifications:"notifications",audit:"audit_events",conflicts:"conflict_declarations",meetings:"meeting_minutes",delegations:"delegations"};
let fullOperationsLoaded=false,fullOperationsPromise=null;
const participantOptions=()=>B().state.participants.map(p=>({value:p.id,label:p.preferred_name||p.full_name}));
const staffOptions=()=>B().state.staff.filter(p=>["staff","supervisor"].includes(p.role)).map(p=>({value:p.id,label:p.full_name}));
const person=id=>B().state.participants.find(p=>p.id===id)?.full_name||"Organisation";
const worker=id=>B().state.staff.find(p=>p.id===id)?.full_name||"Staff member";
const setupMessage=()=>'<div class="notice"><strong>Database upgrade required.</strong> Run <code>florence-audit-readiness-upgrade.sql</code> in Supabase before using this module.</div>';
const card=(title,meta,body="",actions="")=>`<article class="record"><div class="record-top"><div><h3>${B().esc(title)}</h3><p>${B().esc(meta)}</p></div></div>${body?`<p>${B().esc(body)}</p>`:""}${actions?`<div class="record-meta">${actions}</div>`:""}</article>`;
async function loadOperations(){
 if(fullOperationsPromise)return fullOperationsPromise;
 fullOperationsPromise=(async()=>{
 try{
  const db=B().db,org=B().profile.organisation_id,supervisor=B().isSupervisor();
  const queries=Object.entries(tableMap).map(([key,table])=>{
   let query=db.from(table).select("*").eq("organisation_id",org);
   if(["incidents","complaints"].includes(key))query=query.order(key==="incidents"?"occurred_at":"received_at",{ascending:false});
   else if(["notifications","audit"].includes(key))query=query.order(key==="notifications"?"created_at":"occurred_at",{ascending:false}).limit(100);
   else query=query.order("created_at",{ascending:false});
   if(key==="audit"&&!supervisor)return Promise.resolve({data:[],error:null});
   return query;
  });
  const results=await Promise.all(queries);
  const missing=results.find(r=>r.error);
  if(missing)throw missing.error;
  Object.keys(tableMap).forEach((key,i)=>ops[key]=results[i].data||[]);
  fullOperationsLoaded=true;
  renderAll();
 }catch(error){
  ["#incident-list","#complaint-list","#medication-error-list","#timesheet-list","#workforce-request-list","#goal-list","#funding-list","#emergency-list","#credential-list","#notification-list","#audit-list","#conflict-list","#meeting-minutes-list","#delegation-list"].forEach(id=>{if(q(id))q(id).innerHTML=setupMessage()});
 }finally{fullOperationsPromise=null}
 })();
 return fullOperationsPromise;
}
async function loadTimeClock(){
 try{
  const {data,error}=await B().db.from("timesheets").select("*").eq("organisation_id",B().profile.organisation_id).order("created_at",{ascending:false});
  if(error)throw error;
  ops.timesheets=data||[];
  renderTimeClockStatus();
 }catch(error){
  const status=q("#dashboard-clock-status");
  if(status)status.textContent="Open timesheets to check clock status";
 }
}
function renderAll(){renderSafety();renderWorkforce();renderOutcomes();renderGovernance()}
function renderSafety(){
 if(!q("#incident-list"))return;
 q("#incident-list").innerHTML=ops.incidents.map(x=>card(`${x.category} incident`,`${person(x.participant_id)} · ${B().fmt(x.occurred_at)} · ${x.severity}`,x.description,B().isSupervisor()&&x.status!=="Closed"?`<button class="link" data-close-incident="${x.id}">Review and close</button>`:"")).join("")||B().empty("No incidents recorded.");
 q("#complaint-list").innerHTML=ops.complaints.map(x=>card(x.subject,`${x.complainant_name} · ${x.status} · ${B().fmt(x.received_at)}`,x.details,B().isSupervisor()&&x.status!=="Resolved"?`<button class="link" data-resolve-complaint="${x.id}">Record outcome</button>`:"")).join("")||B().empty("No complaints recorded.");
 q("#medication-error-list").innerHTML=ops.medicationIncidents.map(x=>card(x.incident_type,`${person(x.participant_id)} · ${B().fmt(x.occurred_at)} · ${x.status}`,x.description)).join("")||B().empty("No medication errors recorded.");
 q("#controlled-drug-list").innerHTML=ops.controlledDrugs.map(x=>{const med=B().state.medications.find(m=>m.id===x.medication_id);return card(med?.medication_name||"Schedule 8 medication",`${person(x.participant_id)} · ${x.transaction_type} · Balance ${x.balance} · ${B().fmt(x.transaction_at)}`,x.reason||"",`Witness: ${B().esc(worker(x.witnessed_by))} · ${x.recorded_pin_verified&&x.witness_pin_verified?"Dual PIN verified":"Legacy witness record"}`)}).join("")||B().empty("No Schedule 8 stock transactions.");
}
const WORK_TYPES=[
 "Participant support",
 "24-hour support",
 "Personal care",
 "Community access",
 "Social support",
 "Sleepover",
 "Active night",
 "Transport",
 "Domestic assistance",
 "Administration / office work",
 "Training / staff meeting",
 "On-call / coordination",
 "Other"
];
function hours(t){if(!t.clock_out)return"Clocked in";const value=(new Date(t.clock_out)-new Date(t.clock_in))/3600000-(t.break_minutes||0)/60;return Math.max(0,value).toFixed(2)+" hours"}
function timesheetWorkType(t){
 return t.work_type||String(t.notes||"").match(/^Work type:\s*(.+)$/m)?.[1]?.trim()||(t.shift_id?"Rostered support":"Work shift")
}
function timesheetDisplayNotes(t){
 const structured=[t.clock_in_notes,t.clock_out_notes].map(value=>String(value||"").trim()).filter(Boolean);
 if(structured.length)return structured.join(" · ");
 return String(t.notes||"").split("\n").filter(line=>line&&!/^Work type:/i.test(line)).join(" · ")
}
function openTimesheet(){return ops.timesheets.find(t=>t.staff_id===B().profile.id&&!t.clock_out)||null}
function rosterShiftOptions(){
 const now=Date.now();
 return B().state.shifts.filter(shift=>shift.assigned_staff_id===B().profile.id&&shift.status==="Published"&&new Date(shift.ends_at).getTime()>now-12*3600000).map(shift=>({
  value:shift.id,
  label:`${shift.shift_type} · ${shift.participant?.full_name||"Participant"} · ${B().fmt(shift.starts_at)}`
 }));
}
async function openClockInForm(shiftId=""){
 if(!B().isStaffUser())return B().toast("Clocking is available to workers and supervisors");
 if(openTimesheet())return B().toast("You are already clocked in");
 const selectedShift=rosterShiftOptions().some(option=>option.value===shiftId)?shiftId:"";
 const {field,form}=B();
 form("Clock in",[
  field("work_type","Work type","select",WORK_TYPES),
  field("shift_id","Related roster shift (optional)","select",[{value:"",label:"No roster shift — organisation or admin work"},...rosterShiftOptions()],false),
  field("notes","Clock-in notes (optional)","textarea",[],false)
 ],async values=>{
  const notes=[`Work type: ${values.work_type}`,String(values.notes||"").trim()].filter(Boolean).join("\n");
  const {error}=await B().db.rpc("clock_in_timesheet",{
   p_shift_id:values.shift_id||null,
   p_work_type:values.work_type,
   p_notes:String(values.notes||"").trim()||null
  });
  if(error)throw error;
  await loadOperations();
  return `Clocked in — ${values.work_type}`;
 },{work_type:"Participant support",shift_id:selectedShift});
}
async function openClockOutForm(){
 if(!B().isStaffUser())return B().toast("Clocking is available to workers and supervisors");
 const open=openTimesheet();
 if(!open)return B().toast("No open timesheet");
 const {field,form}=B();
 form("Clock out",[
  field("break_minutes","Unpaid break minutes","number",[],false),
  field("notes","Clock-out notes (optional)","textarea",[],false)
 ],async values=>{
  const breakMinutes=Math.max(0,Number(values.break_minutes||0));
  const finishNote=String(values.notes||"").trim();
  const {error}=await B().db.rpc("clock_out_timesheet",{
   p_break_minutes:breakMinutes,
   p_notes:finishNote||null
  });
  if(error)throw error;
  await loadOperations();
  return "Clocked out and timesheet submitted";
 },{break_minutes:open.break_minutes||0});
}
function renderTimeClockStatus(){
 const open=openTimesheet(),status=q("#dashboard-clock-status"),detail=q("#dashboard-clock-detail");
 if(status)status.textContent=open?`Clocked in — ${timesheetWorkType(open)}`:"Not clocked in";
 if(detail)detail.textContent=open?`Started ${B().fmt(open.clock_in)}. Clock out when this work period finishes.`:"Choose participant support, administration / office work, training or another work type when you clock in.";
 document.querySelectorAll("#clock-in,#dashboard-clock-in,[data-roster-clock-in]").forEach(button=>{button.disabled=!!open;button.setAttribute("aria-disabled",String(!!open))});
 document.querySelectorAll("#clock-out,#dashboard-clock-out,[data-roster-clock-out]").forEach(button=>{button.disabled=!open;button.setAttribute("aria-disabled",String(!open))});
}
function currentPayPeriod(){
 const today=new Date(),anchorValue=B().organisation?.pay_period_anchor;
 if(anchorValue){
  const anchor=new Date(anchorValue+"T00:00:00");
  const periods=Math.floor(Math.floor((today-anchor)/86400000)/14);
  const start=new Date(anchor);start.setDate(anchor.getDate()+periods*14);
  const end=new Date(start);end.setDate(start.getDate()+14);
  return {start,end};
 }
 const start=new Date(today);start.setHours(0,0,0,0);start.setDate(start.getDate()-((start.getDay()+6)%7));
 const end=new Date(start);end.setDate(start.getDate()+14);
 return {start,end};
}
function renderWorkforce(){
 renderTimeClockStatus();
 if(!q("#timesheet-list"))return;
 const mine=ops.timesheets.filter(t=>B().isSupervisor()||t.staff_id===B().profile.id);
 q("#timesheet-list").innerHTML=mine.map(t=>card(
  worker(t.staff_id),
  `${B().fmt(t.clock_in)} · ${timesheetWorkType(t)} · ${hours(t)} · ${t.status}`,
  timesheetDisplayNotes(t),
  B().isSupervisor()&&t.clock_out&&t.status!=="Approved"?`<button class="link" data-approve-timesheet="${t.id}">Approve</button>`:""
 )).join("")||B().empty("No timesheets.");
 q("#workforce-request-list").innerHTML=[
  ...ops.leave.map(x=>card("Leave request",`${worker(x.staff_id)} · ${x.starts_on} to ${x.ends_on} · ${x.status}`,x.reason||"")),
  ...ops.availability.map(x=>card(x.availability_type,`${worker(x.staff_id)} · ${B().fmt(x.starts_at)} to ${B().fmt(x.ends_at)}`,x.notes||"")),
  ...ops.travel.map(x=>card(x.expense_type,`${worker(x.staff_id)} · ${x.expense_date} · ${x.kilometres||0} km · $${Number(x.amount||0).toFixed(2)} · ${x.status}`,x.description||""))
 ].join("")||B().empty("No availability, leave or expense entries.");
}
function renderOutcomes(){
 if(!q("#goal-list"))return;
 q("#goal-list").innerHTML=ops.goals.map(x=>card(x.title,`${person(x.participant_id)} · ${x.progress_percent}% · ${x.status}`,x.outcome_notes||x.description||"")).join("")||B().empty("No participant goals.");
 q("#funding-list").innerHTML=ops.funding.map(x=>card("NDIS funding plan",`${person(x.participant_id)} · ${x.starts_on} to ${x.ends_on}`,`Allocated $${Number(x.allocated_amount).toFixed(2)} · Used $${Number(x.used_amount).toFixed(2)}`)).join("")||B().empty("No funding plans.");
 q("#support-item-list").innerHTML=ops.supportItems.map(x=>card(x.item_name,`${x.item_number} · $${Number(x.rate).toFixed(2)} per ${x.unit}`)).join("")||B().empty("No NDIS support items.");
}
function renderGovernance(){
 if(!q("#emergency-list"))return;
 q("#emergency-list").innerHTML=ops.emergencyPlans.map(x=>card(person(x.participant_id),`Emergency plan · review ${x.next_review_date||"not set"}`,x.continuity_arrangements||x.medical_emergency_plan||"Plan recorded")).join("")||B().empty("No participant emergency plans.");
 q("#credential-list").innerHTML=ops.credentials.map(x=>{const days=x.expiry_date?Math.ceil((new Date(x.expiry_date)-new Date())/86400000):null,status=days===null?x.status:days<0?"Expired":days<=30?"Due soon":x.status;return card(x.credential_type,`${worker(x.staff_id)} · expires ${x.expiry_date||"not set"} · ${status}`,x.notes||"")}).join("")||B().empty("No staff credentials.");
 q("#notification-list").innerHTML=ops.notifications.map(x=>card(x.title,`${B().fmt(x.created_at)} · ${x.read_at?"Read":"Unread"}`,x.body)).join("")||B().empty("No notifications.");
 q("#audit-list").innerHTML=B().isSupervisor()?(ops.audit.map(x=>card(`${x.action} · ${x.table_name}`,`${B().fmt(x.occurred_at)} · ${worker(x.actor_id)}`,`Record ${x.record_id||""}`)).join("")||B().empty("No audit activity yet.")):B().empty("Audit history is supervisor-only.");
 q("#retention-summary").innerHTML=[
  B().badge(`${B().state.notes.length} progress notes retained`),
  B().badge(`${B().state.mar.length} MAR entries retained`),
  B().badge(`${B().state.timeline.length} timeline events retained`)
 ].join("");
 const visibleConflicts=ops.conflicts.filter(x=>B().isSupervisor()||x.staff_id===B().profile.id);
 q("#conflict-list").innerHTML=visibleConflicts.map(x=>card(x.declaration_type,`${worker(x.staff_id)} · declared ${B().fmt(x.declared_at)} · ${x.status}`,x.details||"No conflict details required",x.management_actions?`Management: ${B().esc(x.management_actions)}`:"")).join("")||B().empty("No conflict declarations recorded.");
 q("#meeting-minutes-list").innerHTML=ops.meetings.map(x=>card(x.meeting_type,`${B().fmt(x.meeting_at)} · recorded by ${worker(x.recorded_by)}`,x.decisions||x.discussion,`Attendees: ${B().esc(x.attendees)}`)).join("")||B().empty("No meeting minutes recorded.");
 q("#delegation-list").innerHTML=ops.delegations.map(x=>card(x.responsibility,`${worker(x.delegator_id)} → ${worker(x.delegate_id)} · ${x.starts_on}${x.ends_on?` to ${x.ends_on}`:""} · ${x.status}`,x.authority_limits,x.confirmed_by_delegate?B().badge("Delegate confirmed"):B().badge("Confirmation pending"))).join("")||B().empty("No delegations recorded.");
 q("#notification-count").textContent=String(ops.notifications.filter(x=>!x.read_at).length);
}
function bindForms(){
 const {field,form}=B();
 q("#add-incident").onclick=()=>form("Report incident",[
  field("participant_id","Participant (optional)","select",[{value:"",label:"Organisation or staff incident"},...participantOptions()],false),
  field("occurred_at","Date and time","datetime-local"),field("location","Location (optional)","text",[],false),
  field("category","Incident category","select",["Injury","Illness","Fall","Behaviour","Abuse or neglect allegation","Missing person","Property damage","Medication","Privacy","Work health and safety","Other"]),
  field("severity","Severity","select",["Low","Moderate","High","Critical"]),field("description","What happened?","textarea"),
  field("immediate_actions","Immediate actions taken","textarea"),field("injury_or_harm","Injury or harm (optional)","textarea",[],false),
  field("witnesses","Witnesses (optional)","textarea",[],false),field("reportable_status","NDIS reportability","select",["Assessment required","Not reportable","Potentially reportable","Reported to NDIS Commission"])
 ],async v=>{const payload={...v,occurred_at:B().brisbaneLocalToIso(v.occurred_at),participant_id:v.participant_id||null,organisation_id:B().profile.organisation_id,reported_by:B().profile.id,emergency_services:false,status:"Open"};const {error}=await B().db.from("incidents").insert(payload);if(error)throw error;await loadOperations();B().toast("Incident recorded and supervisor notified")});
 q("#add-complaint").onclick=()=>form("Record complaint or feedback",[
  field("participant_id","Participant (optional)","select",[{value:"",label:"General organisation feedback"},...participantOptions()],false),
  field("complainant_name","Complainant name"),field("complainant_contact","Contact details (optional)","text",[],false),
  field("channel","Received through","select",["Portal","Phone","Email","In person","Anonymous","Other"]),field("subject","Subject"),
  field("details","Complaint or feedback","textarea"),field("desired_outcome","Desired outcome (optional)","textarea",[],false),
  field("advocate_details","Advocate or representative (optional)","textarea",[],false)
 ],async v=>{const {error}=await B().db.from("complaints").insert({...v,participant_id:v.participant_id||null,organisation_id:B().profile.organisation_id,submitted_by:B().profile.id,status:"Received"});if(error)throw error;await loadOperations();B().toast("Complaint recorded")});
 q("#add-medication-error").onclick=()=>form("Report medication error",[
  field("participant_id","Participant","select",participantOptions()),field("medication_id","Medication (optional)","select",[{value:"",label:"Not selected"},...B().state.medications.map(m=>({value:m.id,label:m.medication_name+" · "+(m.participant?.full_name||"")}))],false),
  field("occurred_at","Date and time","datetime-local"),field("incident_type","Error type","select",["Wrong medication","Wrong dose","Wrong participant","Wrong time","Wrong route","Omitted or missed","Documentation error","Stock discrepancy","Other"]),
  field("description","What occurred?","textarea"),field("immediate_actions","Immediate actions","textarea"),
  field("clinical_advice","Clinical advice obtained (optional)","textarea",[],false),field("notified_people","People notified (optional)","textarea",[],false),
  field("participant_outcome","Participant outcome (optional)","textarea",[],false),field("follow_up","Follow-up required (optional)","textarea",[],false)
 ],async v=>{const {error}=await B().db.from("medication_incidents").insert({...v,occurred_at:B().brisbaneLocalToIso(v.occurred_at),medication_id:v.medication_id||null,organisation_id:B().profile.organisation_id,reported_by:B().profile.id,status:"Open"});if(error)throw error;await loadOperations();B().toast("Medication error recorded")});
 q("#add-controlled-drug").onclick=()=>form("Schedule 8 stock transaction",[
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
 });
 document.querySelectorAll("#clock-in,#dashboard-clock-in").forEach(button=>button.onclick=()=>openClockInForm());
 document.querySelectorAll("#clock-out,#dashboard-clock-out").forEach(button=>button.onclick=()=>openClockOutForm());
 document.addEventListener("click",event=>{
  const clockInButton=event.target.closest("[data-roster-clock-in]");
  if(clockInButton){event.preventDefault();void openClockInForm(clockInButton.dataset.rosterClockIn);return}
  const clockOutButton=event.target.closest("[data-roster-clock-out]");
  if(clockOutButton){event.preventDefault();void openClockOutForm()}
 });
 q("#add-leave").onclick=()=>form("Request leave",[field("starts_on","First day","date"),field("ends_on","Last day","date"),field("leave_type","Leave type","select",["Annual leave","Personal or carers leave","Unpaid leave","Other"]),field("reason","Notes (optional)","textarea",[],false)],async v=>{const {error}=await B().db.from("leave_requests").insert({...v,organisation_id:B().profile.organisation_id,staff_id:B().profile.id,status:"Pending"});if(error)throw error;await loadOperations();B().toast("Leave request submitted")});
 q("#add-availability").onclick=()=>form("Add availability",[field("starts_at","Available from","datetime-local"),field("ends_at","Available until","datetime-local"),field("availability_type","Type","select",["Available","Unavailable","Preferred"]),field("notes","Notes (optional)","textarea",[],false)],async v=>{const {error}=await B().db.from("worker_availability").insert({...v,organisation_id:B().profile.organisation_id,staff_id:B().profile.id});if(error)throw error;await loadOperations();B().toast("Availability saved")});
 q("#add-travel").onclick=()=>form("Add travel or expense",[field("participant_id","Participant (optional)","select",[{value:"",label:"Not linked"},...participantOptions()],false),field("expense_date","Date","date"),field("expense_type","Type","select",["Participant transport","Provider travel","Parking","Toll","Meal allowance","Other"]),field("kilometres","Kilometres","number",[],false),field("amount","Expense amount","number",[],false),field("description","Description (optional)","textarea",[],false)],async v=>{const {error}=await B().db.from("travel_expenses").insert({...v,participant_id:v.participant_id||null,kilometres:Number(v.kilometres||0),amount:Number(v.amount||0),organisation_id:B().profile.organisation_id,staff_id:B().profile.id,status:"Pending"});if(error)throw error;await loadOperations();B().toast("Travel or expense submitted")});
 q("#add-goal").onclick=()=>form("Add participant goal",[field("participant_id","Participant","select",participantOptions()),field("title","Goal"),field("description","Goal description (optional)","textarea",[],false),field("target_date","Target date (optional)","date",[],false),field("progress_percent","Progress percentage","number"),field("outcome_notes","Outcome notes (optional)","textarea",[],false)],async v=>{const {error}=await B().db.from("participant_goals").insert({...v,progress_percent:Number(v.progress_percent||0),organisation_id:B().profile.organisation_id,created_by:B().profile.id,status:"Active"});if(error)throw error;await loadOperations();B().toast("Goal saved")});
 q("#add-funding").onclick=()=>form("Add funding plan",[field("participant_id","Participant","select",participantOptions()),field("plan_number","Plan number (optional)","text",[],false),field("starts_on","Plan start","date"),field("ends_on","Plan end","date"),field("management_type","Management type","select",["Agency managed","Plan managed","Self managed","Combination"]),field("allocated_amount","Allocated amount","number"),field("used_amount","Used amount","number",[],false),field("notes","Notes (optional)","textarea",[],false)],async v=>{const {error}=await B().db.from("funding_plans").insert({...v,allocated_amount:Number(v.allocated_amount||0),used_amount:Number(v.used_amount||0),organisation_id:B().profile.organisation_id,status:"Active"});if(error)throw error;await loadOperations();B().toast("Funding plan saved")});
 q("#add-support-item").onclick=()=>form("Add NDIS support item",[field("item_number","Support item number"),field("item_name","Support item name"),field("unit","Unit","select",["Hour","Each","Day","Kilometre"]),field("rate","Rate","number"),field("effective_from","Effective from (optional)","date",[],false)],async v=>{const {error}=await B().db.from("ndis_support_items").insert({...v,rate:Number(v.rate),effective_from:v.effective_from||null,organisation_id:B().profile.organisation_id,active:true});if(error)throw error;await loadOperations();B().toast("Support item saved")});
 q("#add-emergency-plan").onclick=()=>form("Participant emergency plan",[field("participant_id","Participant","select",participantOptions()),field("emergency_contacts","Emergency contacts","textarea"),field("evacuation_plan","Evacuation plan","textarea"),field("medical_emergency_plan","Medical emergency response","textarea"),field("communication_support","Communication support","textarea"),field("continuity_arrangements","Continuity of supports","textarea"),field("essential_equipment","Essential equipment (optional)","textarea",[],false),field("preferred_hospital","Preferred hospital (optional)","text",[],false),field("risks","Emergency risks","textarea"),field("last_tested_at","Last tested (optional)","date",[],false),field("next_review_date","Next review","date")],async v=>{const {error}=await B().db.from("emergency_plans").upsert({...v,organisation_id:B().profile.organisation_id,approved_by:B().profile.id},{onConflict:"participant_id"});if(error)throw error;await loadOperations();B().toast("Emergency plan saved")});
 q("#add-credential").onclick=()=>form("Add staff credential",[field("staff_id","Staff member","select",staffOptions()),field("credential_type","Credential","select",["NDIS Worker Screening","Police check","Blue Card","First Aid","CPR","Medication competency","Driver licence","Vehicle insurance","Training","Other"]),field("reference_number","Reference number (optional)","text",[],false),field("issued_date","Issued date (optional)","date",[],false),field("expiry_date","Expiry date (optional)","date",[],false),field("notes","Notes (optional)","textarea",[],false)],async v=>{const {error}=await B().db.from("staff_credentials").insert({...v,organisation_id:B().profile.organisation_id,status:"Current",verified_by:B().profile.id,verified_at:new Date().toISOString()});if(error)throw error;await loadOperations();B().toast("Credential saved")});
 q("#add-conflict").onclick=()=>form("Conflict of interest declaration",[
  field("declaration_type","Declaration","select",["No conflict declared","Actual conflict","Potential conflict","Perceived conflict"]),
  field("details","Details (required when a conflict is disclosed)","textarea",[],false)
 ],async v=>{
  if(v.declaration_type!=="No conflict declared"&&!v.details.trim())throw new Error("Describe the disclosed conflict");
  const {error}=await B().db.from("conflict_declarations").insert({...v,details:v.details||null,organisation_id:B().profile.organisation_id,staff_id:B().profile.id,status:"Current"});
  if(error)throw error;await loadOperations();B().toast("Conflict declaration timestamped and saved")
 });
 q("#add-meeting-minutes").onclick=()=>form("Meeting minutes",[
  field("meeting_type","Meeting type","select",["Management meeting","Staff meeting"]),
  field("meeting_at","Meeting date and time","datetime-local"),field("attendees","Attendees"),
  field("apologies","Apologies (optional)","textarea",[],false),field("agenda","Agenda","textarea"),
  field("discussion","Discussion","textarea"),field("decisions","Decisions (optional)","textarea",[],false),
  field("actions","Actions, owners and due dates (optional)","textarea",[],false),
  field("next_meeting_at","Next meeting (optional)","datetime-local",[],false)
 ],async v=>{
  const {error}=await B().db.from("meeting_minutes").insert({...v,next_meeting_at:v.next_meeting_at||null,apologies:v.apologies||null,decisions:v.decisions||null,actions:v.actions||null,organisation_id:B().profile.organisation_id,recorded_by:B().profile.id});
  if(error)throw error;await loadOperations();B().toast("Meeting minutes timestamped and saved")
 });
 q("#add-delegation").onclick=()=>form("Record delegation",[
  field("delegator_id","Delegated by","select",staffOptions()),
  field("delegate_id","Delegated to","select",staffOptions()),
  field("responsibility","Responsibility or function"),field("authority_limits","Authority limits and escalation requirements","textarea"),
  field("starts_on","Starts","date"),field("ends_on","Ends (optional)","date",[],false)
 ],async v=>{
  if(v.delegator_id===v.delegate_id)throw new Error("The delegator and delegate must be different people");
  const {error}=await B().db.from("delegations").insert({...v,ends_on:v.ends_on||null,organisation_id:B().profile.organisation_id,status:"Active"});
  if(error)throw error;await loadOperations();B().toast("Delegation recorded")
 });
 q("#mark-notifications").onclick=async()=>{const {error}=await B().db.from("notifications").update({read_at:new Date().toISOString()}).eq("recipient_id",B().profile.id).is("read_at",null);if(error)return B().toast(error.message);await loadOperations();B().toast("Notifications marked read")};
 q("#export-timesheets").onclick=async()=>{try{const period=currentPayPeriod(),rows=ops.timesheets.filter(x=>x.status==="Approved"&&new Date(x.clock_in)>=period.start&&new Date(x.clock_in)<period.end);if(!rows.length)throw new Error("There are no approved timesheets in this pay period");await B().auditAccess("EXPORT","timesheets",null,{period_start:period.start.toISOString(),record_count:rows.length});const headings=["Employee","Start date/time","End date/time","Break minutes","Paid hours","Status","Florence record ID"],csv=[headings,...rows.map(x=>[worker(x.staff_id),x.clock_in,x.clock_out||"",x.break_minutes||0,hours(x).replace(" hours",""),x.status,x.id])].map(row=>row.map(value=>`"${String(value??"").replaceAll('"','""')}"`).join(",")).join("\n");const periodName=period.start.toISOString().slice(0,10),file=new File([csv],`florence-pay-period-${periodName}.csv`,{type:"text/csv"});if(navigator.canShare?.({files:[file]}))await navigator.share({title:"Florence pay-period timesheets",files:[file]});else{const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}}catch(error){if(error?.name!=="AbortError")B().toast(error.message)}};
 q("#bell").onclick=()=>{B().showView("governance");loadOperations()};
}
async function setupMfa(){
 const box=q("#mfa-box");if(!box)return;
 try{
  const {data}=await B().db.auth.mfa.getAuthenticatorAssuranceLevel();
  if(data?.currentLevel==="aal2"){box.innerHTML='<div class="notice"><strong>Multi-factor authentication active.</strong> This supervisor session has been verified.</div>';return}
  box.innerHTML='<p>Multi-factor authentication is mandatory. Sign out and back in to complete setup before participant records can be opened.</p>';
  q("#start-mfa").onclick=async()=>{try{const {data,error}=await B().db.auth.mfa.enroll({factorType:"totp",friendlyName:"Florence"});if(error)throw error;box.innerHTML=`<p>Scan this QR code with an authenticator app, then enter the six-digit code.</p><img class="mfa-qr" src="${data.totp.qr_code}" alt="MFA QR code"><input id="mfa-code" inputmode="numeric" maxlength="6" placeholder="6-digit code"><button id="verify-mfa" class="primary">Verify MFA</button>`;q("#verify-mfa").onclick=async()=>{const challenge=await B().db.auth.mfa.challenge({factorId:data.id});if(challenge.error)throw challenge.error;const verify=await B().db.auth.mfa.verify({factorId:data.id,challengeId:challenge.data.id,code:q("#mfa-code").value});if(verify.error)return B().toast(verify.error.message);B().toast("Multi-factor authentication enabled");setupMfa()}}catch(error){B().toast(error.message)}};
 }catch(_error){box.innerHTML='<p>MFA setup is unavailable.</p>'}
}
document.addEventListener("click",async e=>{
 try{
  const viewButton=e.target.closest("[data-view]");
  if(viewButton&&["safety","workforce","outcomes","governance"].includes(viewButton.dataset.view)&&!fullOperationsLoaded)void loadOperations();
  let b=e.target.closest("[data-close-incident]");if(b){const review=prompt("Supervisor review and corrective actions");if(!review)return;const {error}=await B().db.from("incidents").update({status:"Closed",supervisor_review:review,corrective_actions:review,reviewed_by:B().profile.id,closed_at:new Date().toISOString()}).eq("id",b.dataset.closeIncident);if(error)throw error;await loadOperations();return B().toast("Incident reviewed and closed")}
  b=e.target.closest("[data-resolve-complaint]");if(b){const outcome=prompt("Record the complaint outcome");if(!outcome)return;const {error}=await B().db.from("complaints").update({status:"Resolved",outcome,actions_taken:outcome,resolved_at:new Date().toISOString()}).eq("id",b.dataset.resolveComplaint);if(error)throw error;await loadOperations();return B().toast("Complaint resolved")}
  b=e.target.closest("[data-approve-timesheet]");if(b){const {error}=await B().db.from("timesheets").update({status:"Approved",approved_by:B().profile.id,approved_at:new Date().toISOString()}).eq("id",b.dataset.approveTimesheet);if(error)throw error;await loadOperations();return B().toast("Timesheet approved")}
 }catch(error){B().toast(error.message)}
});
let idleTimer;const resetIdle=()=>{clearTimeout(idleTimer);if(B()?.profile)idleTimer=setTimeout(()=>B().db.auth.signOut().then(()=>location.reload()),30*60*1000)};["pointerdown","keydown","touchstart"].forEach(name=>addEventListener(name,resetIdle,{passive:true}));
window.addEventListener("florence:roster-rendered",renderTimeClockStatus);
window.addEventListener("florence:ready",async()=>{if(!B().isStaffUser())return;bindForms();await loadTimeClock();if(B().isSupervisor())await setupMfa();resetIdle()});
})();
