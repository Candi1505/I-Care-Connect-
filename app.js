(() => {
"use strict";
const C=window.FLORENCE_CONFIG||{}, $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const fmt=v=>new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(v));
const date=v=>v?new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v)):"";
const id=()=>crypto.randomUUID?.()||Date.now()+"-"+Math.random().toString(16).slice(2);
let db=null, session=null, profile=null, organisation=null;
let rosterTab="published",medTab="Regular",complianceTab="all",timelineFilter="all",portalFilter="active",pending=null,pendingMed=null,activePortalThread=null;
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
function form(title,fields,handler,values={}){$("#dialog-title").textContent=title;$("#dialog-fields").innerHTML=fields.join("");Object.entries(values).forEach(([k,v])=>{const e=$(`[name="${k}"]`);if(e)e.value=v??""});pending=handler;$("#dialog").showModal()}
const field=(name,label,type="text",options=[])=>type==="textarea"?`<label>${label}<textarea name="${name}" required></textarea></label>`:type==="select"?`<label>${label}<select name="${name}" required>${options.map(o=>`<option value="${esc(typeof o==="string"?o:o.value)}">${esc(typeof o==="string"?o:o.label)}</option>`).join("")}</select></label>`:type==="file"?`<label>${label}<input name="${name}" type="file" required></label>`:`<label>${label}<input name="${name}" type="${type}" required></label>`;

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
async function enterApp(s){
 session=s;
 const {data:p,error}=await db.from("profiles").select("*, organisations(*)").eq("id",s.user.id).single();
 if(error||!p) throw new Error("Your Florence profile has not been activated.");
 profile=p;organisation=p.organisations;
 $("#signed-in-name").textContent=profile.full_name;
 $("#welcome-name").textContent=`Welcome back, ${profile.full_name.split(" ")[0]}`;
 const roleLabels={supervisor:"Supervisor workspace",staff:"Support worker workspace",family:"Family portal",client:"Client portal"};
 $("#role-label").textContent=roleLabels[profile.role]||"Florence workspace";
 $("#login").classList.add("hidden");$("#app").classList.remove("hidden");
 $$(".admin-only").forEach(e=>e.classList.toggle("hidden",!isSupervisor()));
 ["#add-note","#add-timeline-event"].forEach(s=>{const e=$(s);if(e)e.classList.toggle("hidden",!isStaffUser())});
 $$(`[data-view="finance"]`).forEach(e=>e.classList.toggle("hidden",!isSupervisor()));
 if(isPortalUser()){
   $$(`[data-view="notes"]`).forEach(e=>e.classList.add("hidden"));
   $$(`[data-view="compliance"]`).forEach(e=>e.classList.add("hidden"));
   $("#backup")?.classList.add("hidden");
 }
 const h=new Date().getHours();$("#greeting").textContent=h<12?"Good morning":h<17?"Good afternoon":"Good evening";
 await refreshAll();
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
function shiftCard(s){
 let actions="";
 if(isSupervisor()&&s.status==="Draft")actions=`<div class="actions"><button class="publish" data-publish="${s.id}">Publish shift</button></div>`;
 if(!isSupervisor()&&s.status==="Published"&&s.assigned_staff_id===profile.id&&s.response==="Pending")actions=`<div class="actions"><button class="accept" data-shift-response="${s.id}" data-response="Accepted">Accept</button><button class="decline" data-shift-response="${s.id}" data-response="Declined">Decline</button></div>`;
 return `<article class="record"><div class="record-top"><div><h3>${esc(shiftName(s))}</h3><p>${esc(s.shift_type)} · ${esc(workerName(s))}</p></div>${badge(s.status)}</div><p><strong>Start:</strong> ${fmt(s.starts_at)}<br><strong>Finish:</strong> ${fmt(s.ends_at)}</p><div class="record-meta">${badge(s.response)}</div>${actions}</article>`
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
 else if(profile.role==="staff") list=list.filter(s=>s.assigned_staff_id===profile.id);
 else list=list.filter(s=>s.participant_id===profile.participant_id&&s.status==="Published");
 $("#roster-list").innerHTML=list.length?list.map(shiftCard).join(""):empty("No shifts in this view.");
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
function renderMeds(){
 if(medTab==="profiles"){
   $("#med-content").innerHTML=state.medications.map(m=>medicationCard(m)).join("")||empty("No medication profiles.");
 }else if(medTab==="history"){
   $("#med-content").innerHTML=state.mar.map(m=>`<article class="record"><div class="record-top"><div><h3>${esc(m.medication?.medication_name)}</h3><p>${esc(m.participant?.full_name)} · Digitally signed by ${esc(m.worker?.full_name)}</p></div>${badge(m.status)}</div><p>${fmt(m.recorded_at)}</p>${m.notes?`<p><strong>Reason/notes:</strong> ${esc(m.notes)}</p>`:""}<div class="record-meta">${m.pin_verified?badge("PIN verified"):badge("Signature not verified")}</div></article>`).join("")||empty("No MAR history.");
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
function renderFinance(){
 $("#xero-status").textContent=C.xero?.clientId?"Xero client configured; secure backend token exchange still required.":"Xero is not connected.";
 $("#invoice-list").innerHTML=state.invoices.map(i=>`<article class="record"><div class="record-top"><div><h3>${esc(i.invoice_number)}</h3><p>${esc(i.participant?.full_name)} · ${esc(i.description)}</p></div>${badge(i.status)}</div><p>${i.hours} hours × $${Number(i.rate).toFixed(2)} = <strong>$${Number(i.total).toFixed(2)}</strong></p></article>`).join("")||empty("No invoices.");
}

$("#login-form").onsubmit=async e=>{e.preventDefault();try{requireConfig();const {data,error}=await db.auth.signInWithPassword({email:$("#email").value.trim(),password:$("#password").value});if(error)throw error;await enterApp(data.session)}catch(err){toast(err.message)}};
$("#forgot-password").onclick=async()=>{try{requireConfig();const email=$("#email").value.trim();if(!email)throw new Error("Enter your email first");const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.href});if(error)throw error;toast("Password reset email sent")}catch(err){toast(err.message)}};
$("#menu").onclick=openDrawer;$("#scrim").onclick=closeDrawer;$("#logout").onclick=async()=>{await db.auth.signOut();location.reload()};$("#bell").onclick=()=>toast("Notifications are up to date");
$$("[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
$$("[data-roster-tab]").forEach(b=>b.onclick=()=>{$$("[data-roster-tab]").forEach(x=>x.classList.toggle("active",x===b));rosterTab=b.dataset.rosterTab;renderRoster()});
$$("[data-med-tab]").forEach(b=>b.onclick=()=>{$$("[data-med-tab]").forEach(x=>x.classList.toggle("active",x===b));medTab=b.dataset.medTab;renderMeds()});
$$("[data-compliance-tab]").forEach(b=>b.onclick=()=>{$$("[data-compliance-tab]").forEach(x=>x.classList.toggle("active",x===b));complianceTab=b.dataset.complianceTab;renderCompliance()});

$$("[data-portal-filter]").forEach(b=>b.onclick=()=>{$$("[data-portal-filter]").forEach(x=>x.classList.toggle("active",x===b));portalFilter=b.dataset.portalFilter;activePortalThread=null;renderPortal()});

$("[data-timeline-filter]").forEach(b=>b.onclick=()=>{$("[data-timeline-filter]").forEach(x=>x.classList.toggle("active",x===b));timelineFilter=b.dataset.timelineFilter;renderTimeline()});


$("#add-participant").onclick=()=>form("Add participant",[
 field("full_name","Full legal name"),
 field("preferred_name","Preferred name"),
 field("date_of_birth","Date of birth","date"),
 field("ndis_number","NDIS number"),
 field("address","Address"),
 field("phone","Phone"),
 field("emergency_contact","Emergency contact"),
 field("guardian_nominee","Guardian or nominee"),
 field("gp","GP"),
 field("pharmacy","Pharmacy"),
 field("communication_needs","Communication needs","textarea"),
 field("diagnoses","Diagnoses","textarea"),
 field("allergies","Allergies","textarea"),
 field("goals","Goals","textarea"),
 field("preferences","Preferences","textarea"),
 field("risks_and_safeguards","Risks and safeguards","textarea"),
 field("funding_start","Funding start","date"),
 field("funding_end","Funding end","date")
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
 field("assigned_staff_id","Assigned staff member","select",state.staff.filter(s=>s.role==="staff"||s.role==="supervisor").map(s=>({value:s.id,label:s.full_name}))),
 field("starts_at","Start","datetime-local"),field("ends_at","Finish","datetime-local"),
 field("shift_type","Shift type","select",["24-hour support","Personal care","Community access","Social support","Sleepover","Transport"]),
 field("status","Save as","select",["Draft","Published"]),field("instructions","Shift instructions","textarea")
],async v=>{const payload={organisation_id:profile.organisation_id,participant_id:v.participant_id,assigned_staff_id:v.assigned_staff_id,starts_at:new Date(v.starts_at).toISOString(),ends_at:new Date(v.ends_at).toISOString(),shift_type:v.shift_type,status:v.status,response:v.status==="Published"?"Pending":"Not sent",instructions:v.instructions,created_by:profile.id,published_at:v.status==="Published"?new Date().toISOString():null};const {error}=await db.from("shifts").insert(payload);if(error)throw error;await refreshAll();toast(v.status==="Published"?"Shift published":"Draft saved")});
$("#add-note").onclick=()=>form("Create progress note",[field("participant_id","Participant","select",state.participants.map(p=>({value:p.id,label:p.full_name}))),field("category","Note type","select",["Daily support","Personal care","Community access","Health","Communication","Goals and outcomes","Behaviour observation"]),field("content","What support was provided and what was the outcome?","textarea"),field("status","Save note as","select",["Final","Draft"])],async v=>{const {error}=await db.from("progress_notes").insert({organisation_id:profile.organisation_id,participant_id:v.participant_id,staff_id:profile.id,category:v.category,content:v.content,status:v.status});if(error)throw error;await refreshAll();toast("Progress note saved")});
$("#add-med").onclick=()=>form("Add medication profile",[field("participant_id","Participant","select",state.participants.map(p=>({value:p.id,label:p.full_name}))),field("medication_name","Medication name"),field("dose","Dose"),field("route","Route","select",["Oral","Topical","Inhaled","Subcutaneous","Other"]),field("administration_time","Administration time","time"),field("medication_type","Type","select",["Regular","PRN","Schedule 8"]),field("instructions","Administration instructions","textarea")],async v=>{const {error}=await db.from("medications").insert({organisation_id:profile.organisation_id,active:true,created_by:profile.id,...v});if(error)throw error;await refreshAll();toast("Medication added")});
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
 field("thread_type","Type","select",["Message","Request","Information update","Appointment request","Roster request","General question"]),
 field("subject","Subject"),field("message","Message or request","textarea")
],async v=>{const participantId=isPortalUser()?profile.participant_id:v.participant_id;const {data:thread,error}=await db.from("portal_threads").insert({organisation_id:profile.organisation_id,participant_id:participantId,thread_type:v.thread_type,subject:v.subject,status:"Open",created_by:profile.id,updated_at:new Date().toISOString()}).select().single();if(error)throw error;const {error:msgErr}=await db.from("portal_messages").insert({organisation_id:profile.organisation_id,thread_id:thread.id,sender_id:profile.id,message:v.message});if(msgErr)throw msgErr;activePortalThread=thread.id;await refreshAll();toast("Portal item created")});

$("#portal-reply-form").onsubmit=async e=>{e.preventDefault();try{const text=$("#portal-reply-text").value.trim();if(!text||!activePortalThread)return;const {error}=await db.from("portal_messages").insert({organisation_id:profile.organisation_id,thread_id:activePortalThread,sender_id:profile.id,message:text});if(error)throw error;await db.from("portal_threads").update({updated_at:new Date().toISOString()}).eq("id",activePortalThread);$("#portal-reply-text").value="";await refreshAll();toast("Reply sent")}catch(err){toast(err.message)}};

document.addEventListener("click",async e=>{
 try{
  let b=e.target.closest("[data-thread]");if(b){activePortalThread=b.dataset.thread;renderPortal();return}
  b=e.target.closest("[data-archive-thread]");if(b){if(!isStaffUser())throw new Error("This action is available to staff only");const archive=b.dataset.archive==="true";const {error}=await db.from("portal_threads").update({status:archive?"Closed":"Open",updated_at:new Date().toISOString()}).eq("id",b.dataset.archiveThread);if(error)throw error;activePortalThread=null;await refreshAll();return toast(archive?"Conversation archived":"Conversation restored")}
  b=e.target.closest("[data-mar-sign]");if(b){if(!isStaffUser())throw new Error("This action is available to staff only");pendingMed=state.medications.find(x=>x.id===b.dataset.marSign);if(!pendingMed)throw new Error("Medication profile not found");$("#mar-outcome").value=b.dataset.outcome||"Administered";$("#mar-reason").value="";$("#mar-notes").value="";$("#mar-reason-label").classList.toggle("required-reason",$("#mar-outcome").value!=="Administered");$("#pin-summary").textContent=`${pendingMed.medication_name} · ${pendingMed.dose} for ${pendingMed.participant?.full_name}`;$("#pin-dialog").showModal();return}
  b=e.target.closest("[data-publish]");if(b){const {error}=await db.from("shifts").update({status:"Published",response:"Pending",published_at:new Date().toISOString()}).eq("id",b.dataset.publish);if(error)throw error;await refreshAll();return toast("Shift published")}
  b=e.target.closest("[data-shift-response]");if(b){const {error}=await db.from("shifts").update({response:b.dataset.response,responded_at:new Date().toISOString()}).eq("id",b.dataset.shiftResponse).eq("assigned_staff_id",profile.id);if(error)throw error;await refreshAll();return toast("Shift "+b.dataset.response.toLowerCase())}
  b=e.target.closest("[data-administer]");if(b){pendingMed=state.medications.find(x=>x.id===b.dataset.administer);$("#pin-summary").textContent=`${pendingMed.medication_name} · ${pendingMed.dose} for ${pendingMed.participant?.full_name}`;$("#pin-dialog").showModal();return}
  b=e.target.closest("[data-mar-other]");if(b){if(!isStaffUser())throw new Error("This action is available to staff only");const m=state.medications.find(x=>x.id===b.dataset.marOther);const {error}=await db.from("mar_entries").insert({organisation_id:profile.organisation_id,medication_id:m.id,participant_id:m.participant_id,staff_id:profile.id,status:b.dataset.status,pin_verified:false});if(error)throw error;await refreshAll();return toast("MAR recorded")}
  b=e.target.closest("[data-open-doc]");if(b){const d=state.compliance.find(x=>x.id===b.dataset.openDoc);const {data,error}=await db.storage.from(C.storageBucket).createSignedUrl(d.storage_path,60);if(error)throw error;window.open(data.signedUrl,"_blank");return}
  b=e.target.closest("[data-careplan]");if(b){const p=state.participants.find(x=>x.id===b.dataset.careplan);form("Upload PDF care plan",[field("title","Document title"),field("review_date","Review date","date"),field("file","PDF care plan","file")],async(v,fd)=>uploadDocument(fd.get("file"),{scope:"Participant",subject_name:p.full_name,subject_id:p.id,category:"Care plan",title:v.title,review_date:v.review_date}));return}
 }catch(err){toast(err.message)}
});
async function uploadDocument(file,meta){
 if(!file)throw new Error("Choose a file");if(file.size>C.maxDocumentBytes)throw new Error("File exceeds the size limit");if(!C.acceptedDocumentTypes.includes(file.type))throw new Error("File type not accepted");
 const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),path=`${profile.organisation_id}/${meta.scope.toLowerCase()}/${id()}-${safe}`;
 const {error:upError}=await db.storage.from(C.storageBucket).upload(path,file,{contentType:file.type,upsert:false});if(upError)throw upError;
 const {error}=await db.from("compliance_documents").insert({organisation_id:profile.organisation_id,...meta,subject_type:meta.scope.toLowerCase(),storage_path:path,original_filename:file.name,mime_type:file.type,uploaded_by:profile.id});if(error)throw error;
 await refreshAll();toast("Document uploaded securely")
}
$("#upload-compliance").onclick=()=>form("Upload compliance evidence",[field("scope","Document area","select",["Staff","Participant","Organisation"]),field("subject_name","Staff member, participant or organisation"),field("category","Document type","select",["Service agreement","Care plan","NDIS plan","Consent","Risk assessment","Medication chart","Allied health report","Police check","NDIS Worker Screening","Blue Card","First Aid","CPR","Medication competency","Driver licence","Vehicle registration","Vehicle insurance","Policy and procedure","Incident register","Complaints register","Continuous improvement","Internal audit","Staff meeting minutes","Emergency management","Other"]),field("title","Document title"),field("review_date","Expiry or review date","date"),field("file","Choose document or photo","file")],async(v,fd)=>uploadDocument(fd.get("file"),v));
$("#dynamic-form").onsubmit=async e=>{e.preventDefault();if(!pending)return;const fd=new FormData(e.currentTarget),v=Object.fromEntries(fd.entries());try{await pending(v,fd);$("#dialog").close();pending=null;e.currentTarget.reset()}catch(err){toast(err.message)}};
$("#close-dialog").onclick=$("#cancel-dialog").onclick=()=>{$("#dialog").close();pending=null};
$("#pin-form").onsubmit=async e=>{e.preventDefault();try{
 const pin=$("#med-pin").value;
 const outcome=$("#mar-outcome").value;
 const reason=$("#mar-reason").value;
 const extra=$("#mar-notes").value.trim();
 if(outcome!=="Administered"&&!reason)throw new Error("Select why the medication was not administered");
 const notes=[reason,extra].filter(Boolean).join(" — ")||null;
 const {error}=await db.rpc("record_medication_administration",{p_medication_id:pendingMed.id,p_pin:pin,p_status:outcome,p_notes:notes});
 if(error)throw error;
 $("#pin-dialog").close();$("#pin-form").reset();pendingMed=null;await refreshAll();toast(`${outcome} MAR entry digitally signed`);
}catch(err){toast(err.message)}};
$("#close-pin").onclick=$("#cancel-pin").onclick=()=>{$("#pin-dialog").close();pendingMed=null};
$("#backup").onclick=()=>toast("Live Supabase backups are managed from the database project");
$("#connect-xero").onclick=()=>toast("Xero secure backend connection is the next integration step");
$("#mar-outcome").onchange=()=>{$("#mar-reason-label").classList.toggle("required-reason",$("#mar-outcome").value!=="Administered")};
boot();
})();
