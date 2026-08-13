(()=>{
"use strict";
const q=(selector,root=document)=>root.querySelector(selector),qa=(selector,root=document)=>[...root.querySelectorAll(selector)],B=()=>window.FlorenceBridge;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const portalRoles=new Set(["family","client"]);
let complaints=[],activeComplaintId=null,activeSection="conversations",loading=false;

function role(){return String(B()?.profile?.role||"").toLowerCase()}
function isPortalComplainant(){return portalRoles.has(role())}
function isSupervisor(){return role()==="supervisor"}
function canUseComplaintTab(){return isPortalComplainant()||isSupervisor()}
function fmt(value){return value?B()?.fmt?.(value)||new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Brisbane",day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value)):"Not yet"}
function badge(value){const status=String(value||"Received"),kind=status==="Resolved"?"good":status==="Received"||status==="Further review requested"?"amber":"";return `<span class="badge ${kind}">${esc(status)}</span>`}
function empty(message){return B()?.empty?.(message)||`<div class="empty">${esc(message)}</div>`}
function participantName(id){const person=B()?.state?.participants?.find(item=>item.id===id);return person?.preferred_name||person?.full_name||"Participant"}
function complaintThread(complaint){return B()?.state?.portalThreads?.find(thread=>thread.id===complaint?.portal_thread_id)||null}
function complaintMessages(complaint){return (B()?.state?.portalMessages||[]).filter(message=>message.thread_id===complaint?.portal_thread_id)}

function setSection(section){
 if(section==="complaints"&&!canUseComplaintTab())section="conversations";
 activeSection=section;
 qa("[data-portal-section]").forEach(button=>{const selected=button.dataset.portalSection===section;button.classList.toggle("active",selected);button.setAttribute("aria-selected",String(selected))});
 q("#portal-conversations-section")?.classList.toggle("hidden",section!=="conversations");
 q("#portal-complaints-section")?.classList.toggle("hidden",section!=="complaints");
 q("#new-portal-item")?.classList.toggle("hidden",section!=="conversations");
 if(section==="complaints")void loadComplaints();
}

function renderComplaintList(){
 const host=q("#portal-complaint-list"),count=q("#portal-complaint-count");
 if(!host)return;
 const unresolved=complaints.filter(item=>item.status!=="Resolved").length;
 if(count)count.textContent=String(unresolved);
 host.innerHTML=complaints.map(item=>`<button type="button" class="thread-button ${activeComplaintId===item.id?"active":""}" data-portal-complaint="${item.id}"><strong>${esc(item.subject)}</strong><span>${isSupervisor()?`${esc(item.complainant_name)} · ${esc(participantName(item.participant_id))}`:`Submitted ${esc(fmt(item.received_at))}`}</span><small>${esc(item.status||"Received")} · ${esc(fmt(item.updated_at||item.received_at))}</small></button>`).join("")||empty(isSupervisor()?"No portal complaints are awaiting review.":"You have not submitted a complaint through Florence.");
}

function renderComplaintDetail(){
 const title=q("#portal-complaint-title"),detail=q("#portal-complaint-detail"),messagesHost=q("#portal-complaint-messages"),form=q("#portal-complaint-reply-form"),statusWrap=q("#portal-complaint-status-wrap"),status=q("#portal-complaint-status"),submit=form?.querySelector('button[type="submit"],button:not([type])');
 const complaint=complaints.find(item=>item.id===activeComplaintId);
 if(!complaint){
  if(title)title.textContent="Select a complaint";
  if(detail)detail.innerHTML=empty(isSupervisor()?"Choose a complaint to review and reply.":"Choose a complaint to view its progress.");
  if(messagesHost)messagesHost.innerHTML="";
  form?.classList.add("hidden");
  return;
 }
 const thread=complaintThread(complaint),messages=complaintMessages(complaint),assigned=B()?.state?.staff?.find(person=>person.id===complaint.assigned_to)?.full_name;
 if(title)title.innerHTML=`${esc(complaint.subject)} ${badge(complaint.status)}`;
 if(detail)detail.innerHTML=`<article class="complaint-summary"><div class="complaint-summary-grid"><div><strong>Submitted</strong><span>${esc(fmt(complaint.received_at))}</span></div><div><strong>Acknowledged</strong><span>${esc(fmt(complaint.acknowledged_at))}</span></div>${isSupervisor()?`<div><strong>Complainant</strong><span>${esc(complaint.complainant_name||"Florence user")}</span></div><div><strong>Assigned supervisor</strong><span>${esc(assigned||"Not assigned")}</span></div>`:""}</div><div><strong>What happened</strong><p>${esc(complaint.details)}</p></div>${complaint.desired_outcome?`<div><strong>Requested outcome</strong><p>${esc(complaint.desired_outcome)}</p></div>`:""}${complaint.advocate_details?`<div><strong>Advocate or representative</strong><p>${esc(complaint.advocate_details)}</p></div>`:""}${complaint.outcome?`<div><strong>Outcome</strong><p>${esc(complaint.outcome)}</p></div>`:""}${complaint.appeal_information?`<div><strong>Review or appeal information</strong><p>${esc(complaint.appeal_information)}</p></div>`:""}${isSupervisor()&&complaint.investigation?`<div><strong>Investigation record</strong><p>${esc(complaint.investigation)}</p></div>`:""}${isSupervisor()&&complaint.actions_taken?`<div><strong>Actions taken</strong><p>${esc(complaint.actions_taken)}</p></div>`:""}</article>`;
 if(messagesHost)messagesHost.innerHTML=messages.map(message=>`<div class="message-bubble ${message.sender_id===B()?.profile?.id?"mine":""}"><strong>${esc(message.sender?.full_name||"Florence user")}</strong><div>${esc(message.message)}</div><small>${esc(fmt(message.created_at))}</small></div>`).join("")||empty("No complaint replies yet.");
 form?.classList.toggle("hidden",!thread);
 statusWrap?.classList.toggle("hidden",!isSupervisor());
 if(status&&isSupervisor())status.value=complaint.status==="Resolved"?"Resolved":complaint.status==="In review"||complaint.status==="Further review requested"?"In review":"Acknowledged";
 if(submit)submit.textContent=isSupervisor()?"Send reply and update":"Send reply";
 const text=q("#portal-complaint-reply-text");
 if(text)text.placeholder=!isSupervisor()&&complaint.status==="Resolved"?"Ask for further review or add more information…":"Write a reply or add more information…";
}

function renderComplaints(){
 const tab=q('[data-portal-section="complaints"]'),newButton=q("#new-portal-complaint"),listTitle=q("#portal-complaint-list-title");
 tab?.classList.toggle("hidden",!canUseComplaintTab());
 newButton?.classList.toggle("hidden",!isPortalComplainant());
 if(listTitle)listTitle.textContent=isSupervisor()?"Portal complaints":"Your complaints";
 renderComplaintList();
 renderComplaintDetail();
}

async function loadComplaints(){
 const bridge=B();if(!bridge?.db||!bridge?.profile||!canUseComplaintTab()||loading)return;
 loading=true;
 try{
  const {data,error}=await bridge.db.from("complaints").select("id,organisation_id,participant_id,submitted_by,complainant_name,received_at,channel,subject,details,desired_outcome,advocate_details,acknowledged_at,assigned_to,investigation,actions_taken,outcome,appeal_information,status,resolved_at,portal_thread_id,created_at,updated_at").eq("organisation_id",bridge.profile.organisation_id).order("received_at",{ascending:false}).limit(200);
  if(error)throw error;
  complaints=(data||[]).filter(item=>item.channel==="Portal"||item.portal_thread_id);
  if(activeComplaintId&&!complaints.some(item=>item.id===activeComplaintId))activeComplaintId=null;
  if(!activeComplaintId&&complaints.length)activeComplaintId=complaints[0].id;
  renderComplaints();
 }catch(error){
  const host=q("#portal-complaint-list");if(host)host.innerHTML=empty(error?.message||"Florence could not load complaints.");
 }finally{loading=false}
}

function openComplaintForm(){
 const bridge=B();if(!bridge?.form||!isPortalComplainant())return bridge?.toast?.("Complaints can be submitted from a family or participant portal account.");
 bridge.form("Make a complaint",[
  bridge.field("subject","What is your complaint about?"),
  bridge.field("details","Tell us what happened","textarea"),
  bridge.field("desired_outcome","What would you like to happen? (optional)","textarea",[],false),
  bridge.field("advocate_details","Advocate or representative details (optional)","textarea",[],false)
 ],async values=>{
  const {data,error}=await bridge.db.rpc("submit_portal_complaint",{p_subject:values.subject,p_details:values.details,p_desired_outcome:values.desired_outcome||null,p_advocate_details:values.advocate_details||null});
  if(error)throw error;
  const result=Array.isArray(data)?data[0]:data;
  activeComplaintId=result?.complaint_id||null;
  await bridge.refreshAll();
  await loadComplaints();
  setSection("complaints");
  return "Complaint sent securely to the supervisors";
 });
}

async function sendComplaintReply(event){
 event.preventDefault();
 const bridge=B(),complaint=complaints.find(item=>item.id===activeComplaintId),text=q("#portal-complaint-reply-text")?.value.trim();
 if(!bridge?.db||!complaint||!text)return;
 const submit=event.currentTarget.querySelector('button[type="submit"],button:not([type])');if(submit){submit.disabled=true;submit.textContent="Sending…"}
 try{
  const nextStatus=isSupervisor()?q("#portal-complaint-status")?.value:null;
  const {error}=await bridge.db.rpc("reply_to_portal_complaint",{p_complaint_id:complaint.id,p_message:text,p_status:nextStatus});
  if(error)throw error;
  q("#portal-complaint-reply-text").value="";
  await bridge.refreshAll();
  await loadComplaints();
  bridge.toast(isSupervisor()?"Reply sent and complaint updated":"Reply sent securely to the supervisors");
 }catch(error){bridge.toast(error?.message||"Florence could not send the complaint reply.")}
 finally{if(submit){submit.disabled=false;submit.textContent=isSupervisor()?"Send reply and update":"Send reply"}}
}

function bind(){
 if(q("#portal-section-tabs")?.dataset.complaintsBound==="true")return;
 const tabs=q("#portal-section-tabs");if(!tabs)return;tabs.dataset.complaintsBound="true";
 document.addEventListener("click",event=>{
  const section=event.target.closest("[data-portal-section]");if(section){setSection(section.dataset.portalSection);return}
  const complaint=event.target.closest("[data-portal-complaint]");if(complaint){activeComplaintId=complaint.dataset.portalComplaint;renderComplaints();return}
  if(event.target.closest("#new-portal-complaint")){openComplaintForm();return}
  if(event.target.closest('[data-view="portal"]')&&activeSection==="complaints")setTimeout(()=>void loadComplaints(),60);
  const notification=event.target.closest("#notification-list .record,#notification-list article");if(notification&&/complaint/i.test(notification.textContent||"")&&isPortalComplainant())setTimeout(()=>setSection("complaints"),100);
 });
 q("#portal-complaint-reply-form")?.addEventListener("submit",sendComplaintReply);
}

function start(){bind();renderComplaints();setSection(activeSection);if(canUseComplaintTab())void loadComplaints()}
window.addEventListener("florence:ready",start);
window.addEventListener("pageshow",start);
if(document.readyState!=="loading")start();else document.addEventListener("DOMContentLoaded",start,{once:true});
})();
