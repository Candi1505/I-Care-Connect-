(() => {
"use strict";
const C=window.FLORENCE_CONFIG||{}, $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const fmt=v=>new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(v));
const date=v=>v?new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v)):"";
const id=()=>crypto.randomUUID?.()||Date.now()+"-"+Math.random().toString(16).slice(2);
let db=null, session=null, profile=null, organisation=null;
let rosterTab="published",medTab="round",complianceTab="all",timelineFilter="all",portalFilter="active",pending=null,pendingMed=null,activePortalThread=null,marRoundParticipant="",marRoundDate="",marRoundName="Bedtime",marRoundSelections={};
let xeroConnection={checked:false,connected:false,tenant_name:null};
let state={staff:[],participants:[],shifts:[],medications:[],mar:[],notes:[],compliance:[],invoices:[],timeline:[],portalThreads:[],portalMessages:[]};

function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2500)}
function empty(t){return `<div class="empty">${esc(t)}</div>`}
function badge(s){const c=/expired|declined|overdue|refused/i.test(s)?"red":/due|pending|draft|withheld/i.test(s)?"amber":/schedule 8/i.test(s)?"purple":"good";return `<span class="badge ${c}">${esc(s)}</span>`}
function initials(n){return String(n||"?").split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase()}
function isSupervisor(){return profile?.role==="supervisor"}
function isStaffUser(){return profile?.role==="supervisor"||profile?.role==="staff"}
function isPortalUser(){return profile?.role==="family"||profile?.role==="client"}
function requireConfig(){
 if(!C.supabaseUrl||!C.supabaseAnonKey){
   $("#connection-message").textContent="Supabase setup is required before staff can sign in.";
   throw new Error("Add the Supabase URL and anon key to config.js");
 }
 db=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
}
function showView(v){$$(".view").forEach(e=>e.classList.toggle("active",e.id===v+"-view"));$$("[data-view]").forEach(e=>e.classList.toggle("active",e.dataset.view===v));closeDrawer();scrollTo({top:0,behavior:"smooth"})}
function openDrawer(){$("#drawer").classList.add("open");$("#scrim").classList.remove("hidden")}
function closeDrawer(){$("#drawer").classList.remove("open");$("#scrim").classList.add("hidden")}
function openDialog(dialog){
 if(!dialog)throw new Error("Florence could not find the form window.");
 if(dialog.open)return;
 try{
  if(typeof dialog.showModal==="function")dialog.showModal();
  else dialog.setAttribute("open","");
 }catch(_error){
  dialog.setAttribute("open","");
 }
 dialog.classList.add("dialog-open");
}
function closeDialog(dialog){
 if(!dialog)return;
 try{
  if(typeof dialog.close==="function"&&dialog.open)dialog.close();
  else dialog.removeAttribute("open");
 }catch(_error){
  dialog.removeAttribute("open");
 }
 dialog.classList.remove("dialog-open");
}
function form(title,fields,handler,values={}){
 try{
  $("#dialog-title").textContent=title;
  $("#dialog-fields").innerHTML=fields.join("");
  Object.entries(values).forEach(([k,v])=>{const e=$(`[name="${k}"]`);if(e)e.value=v??""});
  pending=handler;
  openDialog($("#dialog"));
 }catch(error){
  pending=null;
  toast(error.message||"Florence could not open this form.");
 }
}
const field=(name,label,type="text",options=[],isRequired=true)=>{const req=isRequired?" required":"";return type==="textarea"?`<label>${label}<textarea name="${name}"${req}></textarea></label>`:type==="select"?`<label>${label}<select name="${name}"${req}>${options.map(o=>`<option value="${esc(typeof o==="string"?o:o.value)}">${esc(typeof o==="string"?o:o.label)}</option>`).join("")}</select></label>`:type==="file"?`<label>${label}<input name="${name}" type="file"${req}></label>`:`<label>${label}<input name="${name}" type="${type}"${req}></label>`};

async function boot(){
 try{
  requireConfig();
  const {data:{session:s}}=await db.auth.getSession();
  if(s) await enterApp(s);
  db.auth.onAuthStateChange(async(_event,newSession)=>{
    if(newSession&&!session) await enterApp(newSession);
    if(!newSession&&session) location.reload();
  });
  $("#connection-message").textContent="Secure sign-in ready.";
 }catch(err){toast(err.message)}
}
async function ensureMfa(){
 const {data:list,error:listError}=await db.auth.mfa.listFactors();if(listError)throw listError;
 const factor=list?.totp?.find(x=>x.status==="verified");if(!factor)return;
 const {data:aal}=await db.auth.mfa.getAuthenticatorAssuranceLevel();if(aal?.currentLevel==="aal2")return;
 const code=prompt("Enter the six-digit code from your Florence authenticator app");
 if(!code)throw new Error("Multi-factor authentication is required");
 const {data:challenge,error:challengeError}=await db.auth.mfa.challenge({factorId:factor.id});if(challengeError)throw challengeError;
 const {error:verifyError}=await db.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code});if(verifyError)throw verifyError;
}
async function enterApp(s){
 session=s;
 await ensureMfa();
 const {data:p,error}=await db.from("profiles").select("*, organisations(*)").eq("id",s.user.id).single();
 if(error||!p) throw new Error("Your Florence profile has not been activated.");
 profile=p;organisation=p.organisations;
 $("#signed-in-name").textContent=profile.full_name;
 $("#welcome-name").textContent=`Welcome back, ${profile.full_name.split(" ")[0]}`;
 const roleLabels={supervisor:"Supervisor workspace",staff:"Support worker workspace",family:"Family portal",client:"Client portal"};
 $("#role-label").textContent=roleLabels[profile.role]||"Florence workspace";
 $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
 $$(".admin-only").forEach(e=>e.classList.toggle("hidden",!isSupervisor()));
 ["#add-note","#add-timeline-event","#add-goal","#add-incident","#add-medication-error","#add-controlled-drug","#clock-in","#clock-out","#add-availability","#add-leave","#add-travel"].forEach(s=>{const e=$(s);if(e)e.classList.toggle("hidden",!isStaffUser())});
 $$(`[data-view="finance"]`).forEach(e=>e.classList.toggle("hidden",!isSupervisor()));
 if(isPortalUser()){
   $$(`[data-view="notes"]`).forEach(e=>e.classList.add("hidden"));
   $('[data-view="compliance"],[data-view="safety"],[data-view="workforce"],[data-view="governance"],[data-view="finance"]').forEach(e=>e.classList.add("hidden"));
   $("#backup")?.classList.add("hidden");$("#import-backup")?.classList.add("hidden");
 }
 const h=new Date().getHours();$("#greeting").textContent=h<12?"Good morning":h<17?"Good afternoon":"Good evening";
 await refreshAll();
 if(isSupervisor()){
  await loadXeroStatus();
  if(new URL(location.href).searchParams.get("xero")==="connected"){toast("Xero organisation connected");history.replaceState({},"",location.pathname)}
 }
 window.dispatchEvent(new CustomEvent("florence:ready"));
}
async function refreshAll(){
 const org=profile.organisation_id;
 const commonQueries=[
  db.from("profiles").select("id,full_name,role,email,active,participant_id").eq("organisation_id",org).eq("active",true),
  db.from("participants").select("*").eq("organisation_id",org).order("full_name"),
  db.from("shifts").select("*, participant:participants(full_name), worker:profiles!shifts_assigned_staff_id_fkey(full_name)").eq("organisation_id",org).order("starts_at"),
  db.from("medications").select("*, participant:participants(full_name)").eq("organisation_id",org).order("administration_time"),
  db.from("mar_entries").select("*, medication:medications(medication_name), participant:participants(full_name), worker:profiles!mar_entries_staff_id_fkey(full_name)").eq("organisation_id",org).order("recorded_at",{ascending:false}),
  db.from("progress_notes").select("*, participant:participants(full_name), worker:profiles!progress_notes_staff_id_fkey(full_name)").eq("organisation_id",org).order("recorded_at",{ascending:false}),
  db.from("compliance_documents").select("*").eq("organisation_id",org).order("uploaded_at",{ascending:false}),
  db.from("client_timeline").select("*, participant:participants(full_name), created_by_profile:profiles!client_timeline_created_by_fkey(full_name)").eq("organisation_id",org).order("occurred_at",{ascending:false}),
  db.from("portal_threads").select("*, participant:participants(full_name), created_by_profile:profiles!portal_threads_created_by_fkey(full_name)").eq("organisation_id",org).order("updated_at",{ascending:false}),
  db.from("portal_messages").select("*, sender:profiles!portal_messages_sender_id_fkey(full_name,role)").eq("organisation_id",org).order("created_at")
 ];
 const invoiceQuery=isSupervisor()
  ? db.from("invoices").select("*, participant:participants(full_name)").eq("organisation_id",org).order("created_at",{ascending:false})
  : Promise.resolve({data:[],error:null});
 const results=await Promise.all([...commonQueries,invoiceQuery]);
 const firstError=results.find(r=>r.error)?.error;
 if(firstError)throw firstError;
 const [staff,participants,shifts,medications,mar,notes,compliance,timeline,portalThreads,portalMessages,invoices]=results.map(r=>r.data||[]);
 Object.assign(state,{staff,participants,shifts,medications,mar,notes,compliance,timeline,portalThreads,portalMessages,invoices});
 render();
}function render(){renderDashboard();renderParticipants();renderRoster();renderMeds();renderNotes();renderTimeline();renderPortal();renderCompliance();renderFinance()}
function expStatus(d){if(!d)return"No review date";const days=Math.ceil((new Date(d)-new Date())/86400000);return days<0?"Expired":days<=30?"Due soon":"Current"}
function shiftName(s){return s.participant?.full_name||"Participant"}
function workerName(s){return s.worker?.full_name||"Unassigned"}
function shiftCard(s,showOwnShiftActions=false){
 const controls=[];
 if(isSupervisor()&&s.status==="Draft")controls.push(`<button class="publish" data-publish="${s.id}">Publish shift</button>`);
 if(isStaffUser()&&s.status==="Published"&&s.response==="Pending"&&(s.assigned_staff_id===profile.id||showOwnShiftActions))controls.push(`<button class="accept" data-shift-response="${s.id}" data-response="Accepted">Accept</button><button class="decline" data-shift-response="${s.id}" data-response="Declined">Decline</button>`);
 if(isStaffUser()&&s.status==="Published"&&s.response==="Pending"&&!s.assigned_staff_id)controls.push(`<button class="accept" data-claim-shift="${s.id}">Claim open shift</button>`);
 if(isSupervisor()&&s.status==="Published")controls.push(`<button class="decline" data-cancel-shift="${s.id}">Cancel shift</button>`);
 const actions=controls.length?`<div class="actions">${controls.join("")}</div>`:"";
 return `<article class="record"><div class="record-top"><div><h3>${esc(shiftName(s))}</h3><p>${esc(s.shift_type)} · ${esc(workerName(s))}</p></div>${badge(s.status)}</div><p><strong>Start:</strong> ${fmt(s.starts_at)}<br><strong>Finish:</strong> ${fmt(s.ends_at)}</p>${s.handover_notes?`<p><strong>Handover:</strong> ${esc(s.handover_notes)}</p>`:""}<div class="record-meta">${badge(s.response)}</div>${actions}</article>`
}
function renderDashboard(){
 const pending=state.shifts.filter(s=>s.status==="Published"&&s.response==="Pending");
 const alerts=state.compliance.filter(d=>["Expired","Due soon"].includes(expStatus(d.review_date)));
 const activeMeds=state.medications.filter(m=>m.active);
 $("#stats").innerHTML=[["👥",state.participants.length,"Participants"],["📅",pending.length,"Awaiting shift response"],["💊",activeMeds.length,"Active medications"],["📝",state.notes.length,"Progress notes"]].map(x=>`<article class="stat"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join("");
 $("#dashboard-medications").innerHTML=activeMeds.length?activeMeds.slice(0,5).map(m=>`<article class="record"><div class="record-top"><div><h3>${esc(m.medication_name)}</h3><p>${esc(m.participant?.full_name)} · ${esc(m.dose)} · ${esc(m.route)}</p></div>${badge(m.administration_time||m.medication_type)}</div></article>`).join(""):empty("No active medication profiles.");
 $("#dashboard-notes").innerHTML=state.notes.length?state.notes.slice(0,4).map(n=>`<article class="record"><div class="record-top"><div><h3>${esc(n.participant?.full_name)}</h3><p>${esc(n.category)} · ${esc(n.worker?.full_name)}</p></div>${badge(fmt(n.recorded_at))}</div><p>${esc(n.content)}</p></article>`).join(""):empty("No progress notes yet.");
 $("#dashboard-shifts").innerHTML=pending.length?pending.slice(0,4).map(shiftCard).join(""):empty("No published shifts are awaiting a response.");
 $("#dashboard-compliance").innerHTML=alerts.length?alerts.slice(0,4).map(d=>`<article class="record"><div class="record-top"><div><h3>${esc(d.title)}</h3><p>${esc(d.scope)} · ${esc(d.subject_name)}</p></div>${badge(expStatus(d.review_date))}</div></article>`).join(""):empty("No documents are due within 30 days.");
}
function renderParticipants(){
 $("#participant-list").innerHTML=state.participants.map(p=>`<article class="person"><div class="avatar">${initials(p.full_name)}</div><div><div class="record-top"><div><h3>${esc(p.preferred_name||p.full_name)}</h3><p>${esc(p.full_name)} · ${esc(p.address||"")}</p></div>${badge(p.status)}</div><p><strong>NDIS:</strong> ${esc(p.ndis_number||"Not entered")}</p><p><strong>Diagnoses:</strong> ${esc(p.diagnoses||"")}</p><p><strong>Communication:</strong> ${esc(p.communication_needs||"")}</p><p><strong>Goals:</strong> ${esc(p.goals||"")}</p><div class="record-meta">${isSupervisor()?`<button class="link" data-careplan="${p.id}">Upload PDF care plan</button>`:""}</div></div></article>`).join("")||empty("No participants.");
}
function renderRoster(){
 let list=state.shifts;
 if(isSupervisor()) list=list.filter(s=>rosterTab==="draft"?s.status==="Draft":rosterTab==="mine"?s.assigned_staff_id===profile.id:s.status==="Published");
 else if(profile.role==="staff") list=list.filter(s=>s.assigned_staff_id===profile.id||(s.status==="Published"&&!s.assigned_staff_id));
 else list=list.filter(s=>s.participant_id===profile.participant_id&&s.status==="Published");
 $("#roster-list").innerHTML=list.length?list.map(s=>shiftCard(s,rosterTab==="mine"&&s.assigned_staff_id===profile.id)).join(""):empty("No shifts in this view.");
}
function marActionButtons(m){
 if(!isStaffUser())return "";
 return `<div class="actions">
   <button class="accept" data-mar-sign="${m.id}" data-outcome="Administered">Administer & sign</button>
   <button class="publish" data-mar-sign="${m.id}" data-outcome="Withheld">Withheld</button>
   <button class="decline" data-mar-sign="${m.id}" data-outcome="Refused">Refused</button>
   <button class="publish" data-mar-sign="${m.id}" data-outcome="Missed">Missed</button>
 </div>`;
}
function medicationCard(m){
 return `<article class="record"><div class="record-top"><div><h3>${esc(m.medication_name)}</h3><p>${esc(m.participant?.full_name)}</p></div>${badge(m.medication_type)}</div>
 <div class="medication-details"><span><strong>Dose</strong>${esc(m.dose)}</span><span><strong>Route</strong>${esc(m.route)}</span><span><strong>Time</strong>${esc(m.administration_time||"PRN")}</span></div>
 ${m.instructions?`<p><strong>Instructions:</strong> ${esc(m.instructions)}</p>`:""}${marActionButtons(m)}</article>`;
}
function brisbaneYmd(value=new Date()){
 return new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Brisbane",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
}
function medicationRound(m){
 if(!m.administration_time)return "Unscheduled";
 const hour=Number(String(m.administration_time).slice(0,2));
 if(hour<11)return "Morning";
 if(hour<15)return "Lunch";
 if(hour<19)return "Evening";
 return "Bedtime";
}
function selectedRoundMeds(){
 const participantId=marRoundParticipant||state.participants[0]?.id||"";
 return state.medications.filter(m=>m.active&&m.participant_id===participantId&&m.medication_type==="Regular"&&medicationRound(m)===marRoundName);
}
function existingRoundEntry(m){
 return state.mar.find(entry=>entry.medication_id===m.id&&brisbaneYmd(entry.recorded_at)===marRoundDate);
}
function roundOutcomeLabel(entry){
 if(!entry)return "";
 const special=String(entry.notes||"").match(/^Round outcome: ([^—]+)/);
 return special?special[1].trim():(entry.status==="Administered"?"Given":entry.status);
}
function renderMarRound(){
 if(!marRoundDate)marRoundDate=brisbaneYmd();
 if(!marRoundParticipant)marRoundParticipant=state.participants[0]?.id||"";
 const participants=state.participants;
 const meds=selectedRoundMeds();
 const completed=meds.filter(existingRoundEntry).length;
 const allSigned=meds.length>0&&completed===meds.length;
 const progress=meds.length?Math.round(completed/meds.length*100):0;
 const outcomes=["Given","Refused","Withheld","Missed","Unavailable","Client absent","Other"];
 const participantOptions=participants.map(p=>`<option value="${p.id}" ${p.id===marRoundParticipant?"selected":""}>${esc(p.preferred_name||p.full_name)}</option>`).join("");
 const cards=meds.map(m=>{
  const existing=existingRoundEntry(m);
  const chosen=marRoundSelections[m.id]||"";
  return `<article class="record mar-round-med">
   <div class="record-top"><div><h3>💊 ${esc(m.medication_name)}</h3><p><strong>${esc(m.dose)}</strong><br>${esc(m.route)} · Due ${esc(String(m.administration_time||"").slice(0,5))}</p></div>${existing?badge(roundOutcomeLabel(existing)):badge(chosen||"Choose outcome")}</div>
   <p>${esc(m.instructions||"No special instructions")}</p>
   ${existing?`<div class="notice mar-signed-item">✓ Recorded ${fmt(existing.recorded_at)} by ${esc(existing.worker?.full_name||"staff")}</div>`:`<div class="mar-outcomes">${outcomes.map(outcome=>`<button type="button" class="${chosen===outcome?"selected":""}" data-round-status="${esc(outcome)}" data-medication-id="${m.id}">${esc(outcome)}</button>`).join("")}</div>`}
  </article>`;
 }).join("");
 const signedNotice=allSigned?`<div class="notice mar-round-complete"><strong>✓ Round already signed</strong><br>All medications in this round have been recorded.</div>`:"";
 $("#med-content").innerHTML=`
  <article class="panel mar-round-header">
   <div class="panel-head"><div><p class="eyebrow">Scheduled medication & MAR</p><h3>Daily medication round</h3></div><span class="badge ${allSigned?"good":"amber"}">${allSigned?"Completed":"In progress"}</span></div>
   <div class="mar-round-controls">
    <label>Participant<select id="mar-round-participant">${participantOptions}</select></label>
    <label>Date<input id="mar-round-date" type="date" value="${esc(marRoundDate)}"></label>
    <label>Round<select id="mar-round-name">${["Morning","Lunch","Evening","Bedtime"].map(r=>`<option ${r===marRoundName?"selected":""}>${r}</option>`).join("")}</select></label>
   </div>
   <div class="mar-progress"><strong>${completed} of ${meds.length} completed</strong><span><i style="width:${progress}%"></i></span></div>
  </article>
  ${signedNotice}
  ${cards||empty("No regular medications are scheduled for this participant and round.")}
  ${!allSigned&&meds.length?`<article class="panel mar-confirm"><h3>Confirm medication round</h3><p>You are confirming the correct participant, medication, dose, route, time and documentation.</p><label>Personal six-digit medication PIN<input id="mar-round-pin" type="password" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" autocomplete="off" placeholder="••••••"></label><button type="button" class="primary wide" id="confirm-mar-round">Confirm and sign round</button></article>`:""}
 `;
}
function renderMeds(){
 if(medTab==="round"){renderMarRound();return}
 if(medTab==="profiles"){
   $("#med-content").innerHTML=state.medications.map(m=>medicationCard(m)).join("")||empty("No medication profiles.");
 }else if(medTab==="history"){
   $("#med-content").innerHTML=state.mar.map(m=>`<article class="record"><div class="record-top"><div><h3>${esc(m.medication?.medication_name)}</h3><p>${esc(m.participant?.full_name)} · Digitally signed by ${esc(m.worker?.full_name)}</p></div>${badge(roundOutcomeLabel(m))}</div><p>${fmt(m.recorded_at)}</p>${m.notes?`<p><strong>Reason/notes:</strong> ${esc(m.notes)}</p>`:""}<div class="record-meta">${m.pin_verified?badge("PIN verified"):badge("Recorded by staff")}</div></article>`).join("")||empty("No MAR history.");
 }else{
   const meds=state.medications.filter(m=>m.active&&m.medication_type===medTab);
   $("#med-content").innerHTML=meds.map(m=>medicationCard(m)).join("")||empty(`No ${medTab} medications.`);
 }
}
function renderNotes(){
 $("#note-list").innerHTML=state.notes.map(n=>`<article class="record"><div class="record-top"><div><h3>${esc(n.participant?.full_name)}</h3><p>${esc(n.category)} · ${esc(n.worker?.full_name)}</p></div>${badge(n.status)}</div><p>${esc(n.content)}</p><div class="record-meta">${badge(fmt(n.recorded_at))}</div></article>`).join("")||empty("No progress notes.");
}

function renderTimeline(){
 let items=state.timeline;
 if(timelineFilter!=="all")items=items.filter(x=>x.event_type===timelineFilter);
 if(!isSupervisor()&&profile.participant_id)items=items.filter(x=>x.participant_id===profile.participant_id);
 $("#timeline-list").innerHTML=items.map(e=>`<article class="record timeline-event ${esc(e.event_type.toLowerCase())}"><div class="record-top"><div><h3>${esc(e.title)}</h3><p>${esc(e.participant?.full_name)} · ${esc(e.event_type)}</p></div>${badge(e.severity||"Recorded")}</div><p>${esc(e.description)}</p>${e.action_taken?`<p><strong>Action taken:</strong> ${esc(e.action_taken)}</p>`:""}${e.follow_up?`<p><strong>Follow-up:</strong> ${esc(e.follow_up)}</p>`:""}<div class="record-meta">${badge(fmt(e.occurred_at))}${e.created_by_profile?.full_name?badge("Added by "+e.created_by_profile.full_name):""}</div></article>`).join("")||empty("No timeline events in this category.");
}
function canSeePortalThread(t){
 if(isSupervisor()||profile.role==="staff")return true;
 return !!profile.participant_id&&t.participant_id===profile.participant_id;
}
function renderPortal(){
 const threads=state.portalThreads.filter(canSeePortalThread).filter(t=>portalFilter==="archived"?t.status==="Closed":t.status!=="Closed");
 $("#portal-thread-list").innerHTML=threads.map(t=>`<button class="thread-button ${activePortalThread===t.id?"active":""}" data-thread="${t.id}"><strong>${esc(t.subject)}</strong><span>${esc(t.participant?.full_name)} · ${esc(t.thread_type)}</span><small>${esc(t.status)} · ${fmt(t.updated_at)}</small></button>`).join("")||empty(portalFilter==="archived"?"No archived conversations.":"No active portal conversations.");
 const thread=threads.find(t=>t.id===activePortalThread);
 if(!thread){$("#portal-thread-title").textContent="Select a conversation";$("#portal-messages").innerHTML=empty("Choose a message or request.");$("#portal-reply-form").classList.add("hidden");return}
 $("#portal-thread-title").innerHTML=`${esc(thread.subject)} ${isStaffUser()?`<button type="button" class="link portal-archive" data-archive-thread="${thread.id}" data-archive="${thread.status==="Closed"?"false":"true"}>${thread.status==="Closed"?"Restore":"Archive"}</button>`:""}`;
 const messages=state.portalMessages.filter(m=>m.thread_id===thread.id);
 $("#portal-messages").innerHTML=messages.map(m=>`<div class="message-bubble ${m.sender_id===profile.id?"mine":""}"><strong>${esc(m.sender?.full_name||"Florence user")}</strong><div>${esc(m.message)}</div><small>${fmt(m.created_at)}</small></div>`).join("")||empty("No messages yet.");
 $("#portal-reply-form").classList.toggle("hidden",thread.status==="Closed");
}
function renderCompliance(){
 let docs=state.compliance;if(complianceTab!=="all")docs=docs.filter(d=>d.scope.toLowerCase()===complianceTab);
 $("#compliance-summary").innerHTML=[["✅",docs.filter(d=>expStatus(d.review_date)==="Current").length,"Current"],["⏳",docs.filter(d=>expStatus(d.review_date)==="Due soon").length,"Due within 30 days"],["⚠️",docs.filter(d=>expStatus(d.review_date)==="Expired").length,"Expired"],["📄",docs.length,"Evidence files"]].map(x=>`<article class="stat"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join("");
 $("#compliance-list").innerHTML=docs.map(d=>`<article class="record"><div class="record-top"><div><h3>${esc(d.title)}</h3><p>${esc(d.scope)} · ${esc(d.subject_name)} · ${esc(d.category)}</p></div>${badge(expStatus(d.review_date))}</div><p>📎 ${esc(d.original_filename)}</p><div class="record-meta">${d.review_date?badge("Review "+date(d.review_date)):badge("No expiry")}<button class="link" data-open-doc="${d.id}">Open securely</button></div></article>`).join("")||empty("No compliance documents.");
}
const BACKUP_FIELDS={
 participants:["id","organisation_id","full_name","preferred_name","date_of_birth","ndis_number","address","phone","emergency_contact","guardian_nominee","gp","pharmacy","communication_needs","diagnoses","allergies","goals","preferences","risks_and_safeguards","funding_start","funding_end","status","created_at"],
 shifts:["id","organisation_id","participant_id","assigned_staff_id","starts_at","ends_at","shift_type","status","response","instructions","created_by","published_at","responded_at","created_at"],
 medications:["id","organisation_id","participant_id","medication_name","dose","route","administration_time","medication_type","instructions","active","created_by","created_at"],
 mar_entries:["id","organisation_id","medication_id","participant_id","staff_id","status","pin_verified","notes","recorded_at"],
 progress_notes:["id","organisation_id","participant_id","staff_id","shift_id","category","content","status","recorded_at"],
 client_timeline:["id","organisation_id","participant_id","event_type","severity","occurred_at","title","description","action_taken","follow_up","created_by","created_at"],
 portal_threads:["id","organisation_id","participant_id","thread_type","subject","status","created_by","assigned_to","created_at","updated_at"],
 portal_messages:["id","organisation_id","thread_id","sender_id","message","created_at"],
 compliance_documents:["id","organisation_id","scope","subject_type","subject_id","subject_name","category","title","storage_path","original_filename","mime_type","review_date","version","uploaded_by","uploaded_at"],
 invoices:["id","organisation_id","participant_id","invoice_number","description","hours","rate","invoice_date","due_date","xero_invoice_id","status","created_by","created_at"]
};
const BACKUP_STATE={participants:"participants",shifts:"shifts",medications:"medications",mar_entries:"mar",progress_notes:"notes",client_timeline:"timeline",portal_threads:"portalThreads",portal_messages:"portalMessages",compliance_documents:"compliance",invoices:"invoices"};
function cleanBackupRow(row,fields){return Object.fromEntries(fields.filter(key=>row[key]!==undefined).map(key=>[key,row[key]]))}
async function exportBackup(){
 if(!isSupervisor())throw new Error("Only supervisors can export organisation data");
 const data=Object.fromEntries(Object.entries(BACKUP_STATE).map(([table,key])=>[table,state[key].map(row=>cleanBackupRow(row,BACKUP_FIELDS[table]))]));
 const payload={format:"florence-data-backup",version:1,exported_at:new Date().toISOString(),organisation_id:profile.organisation_id,organisation_name:organisation?.name||C.organisationName,data};
 const filename=`florence-backup-${brisbaneYmd()}.json`;
 const file=new File([JSON.stringify(payload,null,2)],filename,{type:"application/json"});
 if(navigator.canShare?.({files:[file]})){await navigator.share({title:"Florence data backup",text:"Save this Florence backup securely to Google Drive.",files:[file]})}
 else{const url=URL.createObjectURL(file),a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 toast("Backup ready to save");
}
async function importBackup(file){
 if(!isSupervisor())throw new Error("Only supervisors can import organisation data");
 if(!file) return;
 const payload=JSON.parse(await file.text());
 if(payload.format!=="florence-data-backup"||payload.version!==1||!payload.data)throw new Error("This is not a valid Florence backup");
 if(payload.organisation_id!==profile.organisation_id)throw new Error("This backup belongs to a different organisation");
 if(!confirm("Import this Florence backup? Existing matching records will be updated. Nothing will be deleted."))return;
 for(const [table] of Object.entries(BACKUP_STATE)){
  const rows=Array.isArray(payload.data[table])?payload.data[table].map(row=>({...cleanBackupRow(row,BACKUP_FIELDS[table]),organisation_id:profile.organisation_id})):[];
  if(!rows.length)continue;
  const {error}=await db.from(table).upsert(rows,{onConflict:"id"});
  if(error)throw new Error(`${table}: ${error.message}`);
 }
 await refreshAll();toast("Florence backup imported");
}
async function loadXeroStatus(){
 try{
  const {data,error}=await db.functions.invoke("xero-connect",{body:{action:"status"}});
  if(error)throw error;
  xeroConnection={checked:true,connected:!!data?.connected,tenant_name:data?.tenant_name||null};
 }catch(_error){xeroConnection={checked:true,connected:false,tenant_name:null,setupRequired:true}}
 renderFinance();
}
function renderFinance(){
 const status=$("#xero-status"),connect=$("#connect-xero"),disconnect=$("#disconnect-xero");
 if(status)status.textContent=xeroConnection.connected?`Connected to ${xeroConnection.tenant_name||"Xero"}.`:xeroConnection.setupRequired?"Xero is prepared. VJ’s developer credentials and Supabase function deployment are required.":"Xero is not connected.";
 if(connect){connect.textContent=xeroConnection.connected?"Reconnect Xero":"Connect Xero";connect.disabled=!xeroConnection.checked}
 if(disconnect)disconnect.classList.toggle("hidden",!xeroConnection.connected);
 $("#invoice-list").innerHTML=state.invoices.map(i=>`<article class="record"><div class="record-top"><div><h3>${esc(i.invoice_number)}</h3><p>${esc(i.participant?.full_name)} · ${esc(i.description)}</p></div>${badge(i.status)}</div><p>${i.hours} hours × ${Number(i.rate).toFixed(2)} = <strong>${Number(i.total).toFixed(2)}</strong></p><div class="record-meta">${i.xero_invoice_id?badge("Synced to Xero"):xeroConnection.connected?`<button class="link" data-xero-invoice="${i.id}">Send draft to Xero</button>`:""}</div></article>`).join("")||empty("No invoices.");
}

$("#login-form").onsubmit=async e=>{e.preventDefault();try{requireConfig();const {data,error}=await db.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error)throw error;await enterApp(data.session)}catch(err){toast(err.message)}};
$("#forgot-password").onclick=async()=>{try{requireConfig();const email=$("#email").value.trim();if(!email)throw new Error("Enter your email first");const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.href});if(error)throw error;toast("Password reset email sent")}catch(err){toast(err.message)}};
$("#menu").onclick=openDrawer;$("#scrim").onclick=closeDrawer;$("#logout").onclick=async()=>{await db.auth.signOut();location.reload()};$("#bell").onclick=()=>toast("Notifications are up to date");
$$("[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
$$("[data-roster-tab]").forEach(b=>b.onclick=()=>{$$("[data-roster-tab]").forEach(x=>x.classList.toggle("active",x===b));rosterTab=b.dataset.rosterTab;renderRoster()});
$$("[data-med-tab]").forEach(b=>b.onclick=()=>{$$("[data-med-tab]").forEach(x=>x.classList.toggle("active",x===b));medTab=b.dataset.medTab;renderMeds()});
$$("[data-compliance-tab]").forEach(b=>b.onclick=()=>{$$("[data-compliance-tab]").forEach(x=>x.classList.toggle("active",x===b));complianceTab=b.dataset.complianceTab;renderCompliance()});

$$("[data-portal-filter]").forEach(b=>b.onclick=()=>{$$("[data-portal-filter]").forEach(x=>x.classList.toggle("active",x===b));portalFilter=b.dataset.portalFilter;activePortalThread=null;renderPortal()});

$$("[data-timeline-filter]").forEach(b=>b.onclick=()=>{$$("[data-timeline-filter]").forEach(x=>x.classList.toggle("active",x===b));timelineFilter=b.dataset.timelineFilter;renderTimeline()});


$("#add-participant").onclick=()=>form("Add participant",[
 field("full_name","Full legal name"),
 field("preferred_name","Preferred name (optional)","text",[],false),
 field("date_of_birth","Date of birth (optional)","date",[],false),
 field("ndis_number","NDIS number (optional)","text",[],false),
 field("address","Address (optional)","text",[],false),
 field("phone","Phone (optional)","tel",[],false),
 field("emergency_contact","Emergency contact (optional)","text",[],false),
 field("guardian_nominee","Guardian or nominee (optional)","text",[],false),
 field("gp","GP (optional)","text",[],false),
 field("pharmacy","Pharmacy (optional)","text",[],false),
 field("communication_needs","Communication needs (optional)","textarea",[],false),
 field("diagnoses","Diagnoses (optional)","textarea",[],false),
 field("allergies","Allergies (optional)","textarea",[],false),
 field("goals","Goals (optional)","textarea",[],false),
 field("preferences","Preferences (optional)","textarea",[],false),
 field("risks_and_safeguards","Risks and safeguards (optional)","textarea",[],false),
 field("funding_start","Funding start (optional)","date",[],false),
 field("funding_end","Funding end (optional)","date",[],false)
],async v=>{
 const payload={organisation_id:profile.organisation_id,status:"Active"};
 for(const [k,val] of Object.entries(v))payload[k]=val===""?null:val;
 const {error}=await db.from("participants").insert(payload);
 if(error)throw error;
 await refreshAll();
 toast("Participant added");
});

$("#add-shift").onclick=()=>form("Create roster shift",[
 field("participant_id","Participant","select",state.participants.map(p=>({value:p.id,label:p.full_name}))),
 field("assigned_staff_id","Assigned worker (optional — leave blank to broadcast)","select",[{value:"",label:"Open shift — any worker can claim"},...state.staff.filter(s=>s.role==="staff"||s.role==="supervisor").map(s=>({value:s.id,label:s.full_name}))],false),
 field("starts_at","Start","datetime-local"),field("ends_at","Finish","datetime-local"),
 field("shift_type","Shift type","select",["24-hour support","Personal care","Community access","Social support","Sleepover","Transport","Domestic assistance"]),
 field("repeat_weeks","Repeat for number of weeks (optional)","number",[],false),
 field("status","Save as","select",["Draft","Published"]),field("instructions","Shift instructions (optional)","textarea",[],false),
 field("handover_notes","Handover information (optional)","textarea",[],false)
],async v=>{
 const starts=new Date(v.starts_at),ends=new Date(v.ends_at);if(ends<=starts)throw new Error("Shift finish must be after its start");
 const count=Math.min(52,Math.max(1,Number(v.repeat_weeks||1))),group=count>1?id():null,rows=[];
 for(let week=0;week<count;week++){
  const shiftStart=new Date(starts.getTime()+week*7*86400000),shiftEnd=new Date(ends.getTime()+week*7*86400000);
  if(v.assigned_staff_id&&state.shifts.some(s=>s.assigned_staff_id===v.assigned_staff_id&&s.status!=="Cancelled"&&new Date(s.starts_at)<shiftEnd&&new Date(s.ends_at)>shiftStart))throw new Error(`Roster conflict in week ${week+1}: this worker already has an overlapping shift`);
  rows.push({organisation_id:profile.organisation_id,participant_id:v.participant_id,assigned_staff_id:v.assigned_staff_id||null,starts_at:shiftStart.toISOString(),ends_at:shiftEnd.toISOString(),shift_type:v.shift_type,status:v.status,response:v.status==="Published"?"Pending":"Not sent",instructions:v.instructions||null,handover_notes:v.handover_notes||null,recurrence_group:group,created_by:profile.id,published_at:v.status==="Published"?new Date().toISOString():null});
 }
 const {error}=await db.from("shifts").insert(rows);if(error)throw error;await refreshAll();toast(count>1?`${count} recurring shifts created`:v.status==="Published"?"Shift published":"Draft saved")
});
$("#add-note").onclick=()=>form("Create progress note",[field("participant_id","Participant","select",state.participants.map(p=>({value:p.id,label:p.full_name}))),field("category","Note type","select",["Daily support","Personal care","Community access","Health","Communication","Goals and outcomes","Behaviour observation"]),field("content","What support was provided and what was the outcome?","textarea"),field("status","Save note as","select",["Final","Draft"])],async v=>{const {error}=await db.from("progress_notes").insert({organisation_id:profile.organisation_id,participant_id:v.participant_id,staff_id:profile.id,category:v.category,content:v.content,status:v.status});if(error)throw error;await refreshAll();toast("Progress note saved")});
$("#add-med").onclick=()=>form("Add medication profile",[
 field("participant_id","Participant","select",state.participants.map(p=>({value:p.id,label:p.full_name}))),
 field("medication_name","Medication name"),field("dose","Dose"),field("route","Route","select",["Oral","Topical","Inhaled","Subcutaneous","Other"]),
 field("administration_time","Administration time (optional for PRN)","time",[],false),field("medication_type","Type","select",["Regular","PRN","Schedule 8"]),
 field("prn_indication","PRN indication (optional)","textarea",[],false),field("max_prn_dose","Maximum PRN dose (optional)","text",[],false),
 field("hold_from","Hold from (optional)","date",[],false),field("hold_until","Hold until (optional)","date",[],false),field("ceased_at","Ceased date (optional)","date",[],false),
 field("instructions","Administration instructions (optional)","textarea",[],false)
],async v=>{const payload={organisation_id:profile.organisation_id,active:!v.ceased_at,created_by:profile.id,...v};for(const key of ["administration_time","prn_indication","max_prn_dose","hold_from","hold_until","ceased_at","instructions"])if(!payload[key])payload[key]=null;const {error}=await db.from("medications").insert(payload);if(error)throw error;await refreshAll();toast("Medication added")});
$("#create-invoice").onclick=()=>form("Create invoice",[field("participant_id","Participant","select",state.participants.map(p=>({value:p.id,label:p.full_name}))),field("description","NDIS support or line item"),field("hours","Billable hours","number"),field("rate","Hourly rate","number"),field("invoice_date","Invoice date","date")],async v=>{const number=`ICC-${Date.now().toString().slice(-8)}`;const {error}=await db.from("invoices").insert({organisation_id:profile.organisation_id,invoice_number:number,status:"Draft",created_by:profile.id,...v});if(error)throw error;await refreshAll();toast("Invoice created")});


$("#add-timeline-event").onclick=()=>form("Add client timeline event",[
 field("participant_id","Participant","select",state.participants.map(p=>({value:p.id,label:p.full_name}))),
 field("event_type","Event type","select",["Fall","Behaviour","Medication","Health","Incident","Hospital","Appointment","Family update","Other"]),
 field("severity","Severity","select",["Low","Moderate","High"]),
 field("occurred_at","Date and time","datetime-local"),field("title","Short title"),
 field("description","What happened?","textarea"),field("action_taken","Action taken","textarea"),field("follow_up","Follow-up required","textarea")
],async v=>{const {error}=await db.from("client_timeline").insert({organisation_id:profile.organisation_id,created_by:profile.id,...v,occurred_at:new Date(v.occurred_at).toISOString()});if(error)throw error;await refreshAll();toast("Timeline event added")});

$("#new-portal-item").onclick=()=>form("New portal message or request",[
 ...(isPortalUser()?[]:[field("participant_id","Participant","select",state.participants.map(p=>({value:p.id,label:p.full_name})))]),
 field("thread_type","Type","select",["Message","Request","Complaint or feedback","Information update","Appointment request","Roster request","General question"]),
 field("subject","Subject"),field("message","Message or request","textarea")
],async v=>{const participantId=isPortalUser()?profile.participant_id:v.participant_id;const {data:thread,error}=await db.from("portal_threads").insert({organisation_id:profile.organisation_id,participant_id:participantId,thread_type:v.thread_type,subject:v.subject,status:"Open",created_by:profile.id,updated_at:new Date().toISOString()}).select().single();if(error)throw error;const {error:msgErr}=await db.from("portal_messages").insert({organisation_id:profile.organisation_id,thread_id:thread.id,sender_id:profile.id,message:v.message});if(msgErr)throw msgErr;if(v.thread_type==="Complaint or feedback"){const {error:complaintError}=await db.from("complaints").insert({organisation_id:profile.organisation_id,participant_id:participantId,submitted_by:profile.id,complainant_name:profile.full_name,complainant_contact:profile.email||null,channel:"Portal",subject:v.subject,details:v.message,status:"Received"});if(complaintError)throw complaintError}activePortalThread=thread.id;await refreshAll();toast(v.thread_type==="Complaint or feedback"?"Complaint received securely":"Portal item created")});

$("#portal-reply-form").onsubmit=async e=>{e.preventDefault();try{const text=$("#portal-reply-text").value.trim();if(!text||!activePortalThread)return;const {error}=await db.from("portal_messages").insert({organisation_id:profile.organisation_id,thread_id:activePortalThread,sender_id:profile.id,message:text});if(error)throw error;await db.from("portal_threads").update({updated_at:new Date().toISOString()}).eq("id",activePortalThread);$("#portal-reply-text").value="";await refreshAll();toast("Reply sent")}catch(err){toast(err.message)}};

document.addEventListener("change",e=>{
 if(e.target.id==="mar-round-participant"){marRoundParticipant=e.target.value;marRoundSelections={};renderMarRound()}
 if(e.target.id==="mar-round-date"){marRoundDate=e.target.value;marRoundSelections={};renderMarRound()}
 if(e.target.id==="mar-round-name"){marRoundName=e.target.value;marRoundSelections={};renderMarRound()}
});
document.addEventListener("click",async e=>{
 try{
  let b=e.target.closest("[data-round-status]");if(b){marRoundSelections[b.dataset.medicationId]=b.dataset.roundStatus;renderMarRound();return}
  b=e.target.closest("#confirm-mar-round");if(b){
   const meds=selectedRoundMeds().filter(m=>!existingRoundEntry(m));
   if(!meds.length)throw new Error("This medication round has already been signed");
   const missing=meds.filter(m=>!marRoundSelections[m.id]);
   if(missing.length)throw new Error("Choose an outcome for every medication");
   const pin=$("#mar-round-pin")?.value||"";
   if(!/^\d{6}$/.test(pin))throw new Error("Enter your six-digit medication PIN");
   const map={Given:"Administered",Refused:"Refused",Withheld:"Withheld",Missed:"Missed",Unavailable:"Missed","Client absent":"Missed",Other:"Withheld"};
   for(const med of meds){
    const outcome=marRoundSelections[med.id];
    const notes=["Unavailable","Client absent","Other"].includes(outcome)?`Round outcome: ${outcome}`:null;
    const {error}=await db.rpc("record_medication_administration",{p_medication_id:med.id,p_pin:pin,p_status:map[outcome],p_notes:notes});
    if(error)throw error;
   }
   marRoundSelections={};await refreshAll();return toast("Medication round signed and saved");
  }
  b=e.target.closest("[data-xero-invoice]");if(b){if(!confirm("Send this invoice to Xero as a draft?"))return;const {data,error}=await db.functions.invoke("xero-connect",{body:{action:"sync-invoice",invoice_id:b.dataset.xeroInvoice}});if(error||data?.error)throw new Error(data?.error||"Xero invoice sync failed");await refreshAll();return toast("Invoice sent to Xero as a draft")}
  b=e.target.closest("[data-thread]");if(b){activePortalThread=b.dataset.thread;renderPortal();return}
  b=e.target.closest("[data-archive-thread]");if(b){if(!isStaffUser())throw new Error("This action is available to staff only");const archive=b.dataset.archive==="true";const {error}=await db.from("portal_threads").update({status:archive?"Closed":"Open",updated_at:new Date().toISOString()}).eq("id",b.dataset.archiveThread);if(error)throw error;activePortalThread=null;await refreshAll();return toast(archive?"Conversation archived":"Conversation restored")}
  b=e.target.closest("[data-mar-sign]");if(b){if(!isStaffUser())throw new Error("This action is available to staff only");pendingMed=state.medications.find(x=>x.id===b.dataset.marSign);if(!pendingMed)throw new Error("Medication profile not found");$("#mar-outcome").value=b.dataset.outcome||"Administered";$("#mar-reason").value="";$("#mar-notes").value="";$("#mar-reason-label").classList.toggle("required-reason",$("#mar-outcome").value!=="Administered");$("#pin-summary").textContent=`${pendingMed.medication_name} · ${pendingMed.dose} for ${pendingMed.participant?.full_name}`;openDialog($("#pin-dialog"));return}
  b=e.target.closest("[data-claim-shift]");if(b){const {data,error}=await db.from("shifts").update({assigned_staff_id:profile.id,response:"Accepted",responded_at:new Date().toISOString()}).eq("id",b.dataset.claimShift).is("assigned_staff_id",null).eq("status","Published").select();if(error)throw error;if(!data?.length)throw new Error("This shift has already been claimed");await refreshAll();return toast("Open shift claimed")}
  b=e.target.closest("[data-cancel-shift]");if(b){const reason=prompt("Why is this shift being cancelled?");if(!reason)return;const {error}=await db.from("shifts").update({status:"Cancelled",cancellation_reason:reason,cancelled_at:new Date().toISOString()}).eq("id",b.dataset.cancelShift);if(error)throw error;await refreshAll();return toast("Shift cancelled")}
  b=e.target.closest("[data-publish]");if(b){const {error}=await db.from("shifts").update({status:"Published",response:"Pending",published_at:new Date().toISOString()}).eq("id",b.dataset.publish);if(error)throw error;await refreshAll();return toast("Shift published")}
  b=e.target.closest("[data-shift-response]");if(b){const {error}=await db.from("shifts").update({response:b.dataset.response,responded_at:new Date().toISOString()}).eq("id",b.dataset.shiftResponse).eq("assigned_staff_id",profile.id);if(error)throw error;await refreshAll();return toast("Shift "+b.dataset.response.toLowerCase())}
  b=e.target.closest("[data-administer]");if(b){pendingMed=state.medications.find(x=>x.id===b.dataset.administer);$("#pin-summary").textContent=`${pendingMed.medication_name} · ${pendingMed.dose} for ${pendingMed.participant?.full_name}`;openDialog($("#pin-dialog"));return}
  b=e.target.closest("[data-mar-other]");if(b){if(!isStaffUser())throw new Error("This action is available to staff only");const m=state.medications.find(x=>x.id===b.dataset.marOther);const {error}=await db.from("mar_entries").insert({organisation_id:profile.organisation_id,medication_id:m.id,participant_id:m.participant_id,staff_id:profile.id,status:b.dataset.status,pin_verified:false});if(error)throw error;await refreshAll();return toast("MAR recorded")}
  b=e.target.closest("[data-open-doc]");if(b){const d=state.compliance.find(x=>x.id===b.dataset.openDoc);const {data,error}=await db.storage.from(C.storageBucket).createSignedUrl(d.storage_path,60);if(error)throw error;window.open(data.signedUrl,"_blank");return}
  b=e.target.closest("[data-careplan]");if(b){const p=state.participants.find(x=>x.id===b.dataset.careplan);form("Upload PDF care plan",[field("title","Document title"),field("review_date","Review date","date"),field("file","PDF care plan","file")],async(v,fd)=>uploadDocument(fd.get("file"),{scope:"Participant",subject_name:p.full_name,subject_id:p.id,category:"Care plan",title:v.title,review_date:v.review_date}));return}
 }catch(err){toast(err.message)}
});
async function uploadDocument(file,meta){
 if(!file)throw new Error("Choose a file");if(file.size>C.maxDocumentBytes)throw new Error("File exceeds the size limit");if(!C.acceptedDocumentTypes.includes(file.type))throw new Error("File type not accepted");
 const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),path=`${profile.organisation_id}/${meta.scope.toLowerCase()}/${id()}-${safe}`;
 const {error:upError}=await db.storage.from(C.storageBucket).upload(path,file,{contentType:file.type,upsert:false});if(upError)throw upError;
 const {file:_selectedFile,...documentMeta}=meta;const {error}=await db.from("compliance_documents").insert({organisation_id:profile.organisation_id,...documentMeta,subject_type:documentMeta.scope.toLowerCase(),storage_path:path,original_filename:file.name,mime_type:file.type,uploaded_by:profile.id});if(error)throw error;
 await refreshAll();toast("Document uploaded securely")
}
$("#upload-compliance").onclick=()=>form("Upload compliance evidence",[field("scope","Document area","select",["Staff","Participant","Organisation"]),field("subject_name","Staff member, participant or organisation"),field("category","Document type","select",["Service agreement","Care plan","NDIS plan","Consent","Risk assessment","Medication chart","Allied health report","Police check","NDIS Worker Screening","Blue Card","First Aid","CPR","Medication competency","Driver licence","Vehicle registration","Vehicle insurance","Policy and procedure","Incident register","Complaints register","Continuous improvement","Internal audit","Staff meeting minutes","Emergency management","Other"]),field("title","Document title"),field("review_date","Expiry or review date","date"),field("file","Choose document or photo","file")],async(v,fd)=>uploadDocument(fd.get("file"),v));
$("#dynamic-form").onsubmit=async e=>{e.preventDefault();if(!pending)return;const fd=new FormData(e.currentTarget),v=Object.fromEntries(fd.entries());try{await pending(v,fd);closeDialog($("#dialog"));pending=null;e.currentTarget.reset()}catch(err){toast(err.message)}};
$("#close-dialog").onclick=$("#cancel-dialog").onclick=()=>{closeDialog($("#dialog"));pending=null};
$("#pin-form").onsubmit=async e=>{e.preventDefault();try{
 const pin=$("#med-pin").value;
 const outcome=$("#mar-outcome").value;
 const reason=$("#mar-reason").value;
 const extra=$("#mar-notes").value.trim();
 if(outcome!=="Administered"&&!reason)throw new Error("Select why the medication was not administered");
 const notes=[reason,extra].filter(Boolean).join(" — ")||null;
 const {error}=await db.rpc("record_medication_administration",{p_medication_id:pendingMed.id,p_pin:pin,p_status:outcome,p_notes:notes});
 if(error)throw error;
 closeDialog($("#pin-dialog"));$("#pin-form").reset();pendingMed=null;await refreshAll();toast(`${outcome} MAR entry digitally signed`);
}catch(err){toast(err.message)}};
$("#close-pin").onclick=$("#cancel-pin").onclick=()=>{closeDialog($("#pin-dialog"));pendingMed=null};
$("#backup").onclick=async()=>{try{await exportBackup()}catch(err){if(err?.name!=="AbortError")toast(err.message)}};
$("#import-backup").onclick=()=>$("#backup-file").click();
$("#backup-file").onchange=async e=>{try{await importBackup(e.target.files?.[0])}catch(err){toast(err.message)}finally{e.target.value=""}};
$("#connect-xero").onclick=async()=>{try{const {data,error}=await db.functions.invoke("xero-connect",{body:{action:"start"}});if(error||!data?.authorization_url)throw new Error("Xero setup is not deployed yet");location.href=data.authorization_url}catch(err){toast(err.message)}};
$("#disconnect-xero").onclick=async()=>{try{if(!confirm("Disconnect Florence from Xero?"))return;const {data,error}=await db.functions.invoke("xero-connect",{body:{action:"disconnect"}});if(error||data?.error)throw new Error(data?.error||"Could not disconnect Xero");await loadXeroStatus();toast("Xero disconnected")}catch(err){toast(err.message)}};
$("#mar-outcome").onchange=()=>{$("#mar-reason-label").classList.toggle("required-reason",$("#mar-outcome").value!=="Administered")};
window.FlorenceBridge={
 get db(){return db},get profile(){return profile},get organisation(){return organisation},get state(){return state},
 toast,form,field,showView,openDialog,closeDialog,esc,fmt,date,badge,empty,isSupervisor,isStaffUser,refreshAll
};
boot();
})();
