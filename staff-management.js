(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=s=>document.querySelector(s);
let directory=[],assignments=[],edgeError="";
const ROLES=[
 {value:"staff",label:"Support worker"},
 {value:"supervisor",label:"Supervisor"},
 {value:"family",label:"Family representative portal"},
 {value:"client",label:"Participant portal"}
];
const roleLabel=role=>({supervisor:"Supervisor",staff:"Support worker",family:"Family representative",client:"Participant"}[role]||role);
const accountStatus=person=>!person.active?"Inactive":person.banned_until?"Suspended":person.last_sign_in_at?"Active":person.created_at?"Invited":"Account";
async function invoke(body){
 const {data,error}=await B().db.functions.invoke("staff-management",{body});
 if(error){
  let message=data?.error||error.message||"Staff management is unavailable";
  try{if(error.context instanceof Response){const payload=await error.context.clone().json();message=payload?.error||message}}catch(_ignored){}
  if(/failed to send|fetch/i.test(message))message="Florence could not reach the staff-management Edge Function. Confirm the Edge Function secrets allow https://i-care-connect.candi1505.workers.dev and redeploy the current function if required.";
  throw new Error(message);
 }
 if(data?.error)throw new Error(data.error);
 return data;
}
async function fallbackDirectory(){
 const {data,error}=await B().db.from("profiles").select("id,full_name,email,role,active,participant_id,created_at").eq("organisation_id",B().profile.organisation_id).order("full_name");
 if(error)throw error;
 return {staff:(data||[]).map(person=>({...person,last_sign_in_at:null,banned_until:null}))};
}
async function loadDirectory(){
 if(!B().isSupervisor())return;
 let directoryResult;
 try{directoryResult=await invoke({action:"list"});edgeError=""}
 catch(error){edgeError=error.message;directoryResult=await fallbackDirectory()}
 const accessResult=await B().db.from("participant_access_assignments").select("*").eq("active",true).is("revoked_at",null);
 if(accessResult.error)edgeError=[edgeError,accessResult.error.message].filter(Boolean).join(" ");
 directory=directoryResult.staff||[];
 assignments=accessResult.data||[];
 renderDirectory();
}
function participantOptions(selected=""){
 return `<option value="">Not linked</option>${B().state.participants.map(participant=>`<option value="${participant.id}" ${participant.id===selected?"selected":""}>${B().esc(participant.preferred_name||participant.full_name)}</option>`).join("")}`;
}
function renderDirectory(){
 const target=q("#staff-directory");
 if(!target)return;
 const serviceNotice=edgeError?`<div class="notice"><strong>Account service needs attention.</strong><br>${B().esc(edgeError)} Existing profiles are shown from Florence’s secure database, but invitations and role changes require the Edge Function.<div class="actions"><button id="retry-staff-directory" type="button" class="secondary">Retry connection</button></div></div>`:"";
 const cards=directory.map(person=>{
  const status=accountStatus(person),portal=["family","client"].includes(person.role);
  const last=person.last_sign_in_at?`Last sign-in ${B().fmt(person.last_sign_in_at)}`:person.active?"Invitation or account pending first sign-in":"Access inactive";
  const roleSelect=`<label class="role-control">Role<select data-person-role="${person.id}" data-original-role="${person.role}">${ROLES.map(role=>`<option value="${role.value}" ${person.role===role.value?"selected":""}>${B().esc(role.label)}</option>`).join("")}</select></label>`;
  const participantSelect=`<label class="role-control">Portal participant<select data-person-participant="${person.id}" ${portal?"":"disabled"}>${participantOptions(person.participant_id||"")}</select></label>`;
  const participantAccess=person.role==="staff"?`<fieldset class="participant-access"><legend>Ongoing participant access</legend><p class="record-meta">Tick ongoing access only while this worker supports the participant. A published rostered shift also grants time-limited access.</p>${B().state.participants.map(participant=>{const checked=assignments.some(assignment=>assignment.staff_id===person.id&&assignment.participant_id===participant.id);return `<label><input type="checkbox" data-participant-access="${person.id}" data-participant-id="${participant.id}" ${checked?"checked":""}> ${B().esc(participant.preferred_name||participant.full_name)}</label>`}).join("")||"<small>Add a participant before assigning access.</small>"}</fieldset>`:"";
  return `<article class="record staff-card ${person.active?"":"inactive"}"><div class="record-top"><div><h3>${B().esc(person.full_name)}</h3><p class="staff-email">${B().esc(person.email||"No email")}</p></div>${B().badge(status)}</div><div class="staff-invite-status">${B().badge(roleLabel(person.role))}<span class="badge">${B().esc(last)}</span></div><div class="role-controls">${roleSelect}${participantSelect}</div><div class="actions"><button class="secondary" data-resend-worker="${person.id}">Resend access email</button><button class="${person.active?"decline":"accept"}" data-toggle-worker="${person.id}" data-active="${person.active?"false":"true"}">${person.active?"Deactivate":"Reactivate"}</button></div>${participantAccess}</article>`;
 }).join("")||B().empty("No Florence accounts yet.");
 target.innerHTML=serviceNotice+cards;
}
function bindInvite(){
 q("#invite-worker").onclick=()=>B().form("Invite person",[
  B().field("full_name","Full name"),
  B().field("email","Email address","email"),
  B().field("role","Florence access","select",ROLES),
  B().field("participant_id","Linked participant (required for family or participant portal)","select",[{value:"",label:"Not applicable — worker or supervisor"},...B().state.participants.map(participant=>({value:participant.id,label:participant.full_name}))],false)
 ],async values=>{
  const email=values.email.trim().toLowerCase();
  if(["family","client"].includes(values.role)&&!values.participant_id)throw new Error("Choose the participant this portal account belongs to");
  const result=await invoke({action:"invite",full_name:values.full_name.trim(),email,role:values.role,participant_id:values.participant_id||null});
  if(result.requires_password_reset){const {error}=await B().db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error}
  await loadDirectory();
  return result.existing?"Existing account linked and access email sent":"Invitation sent securely";
 });
}
function bindAccountForms(){
 q("#set-pin-form").onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;try{const pin=q("#new-signing-pin").value,confirmPin=q("#confirm-signing-pin").value;if(!/^\d{6}$/.test(pin))throw new Error("Enter exactly six numbers");if(pin!==confirmPin)throw new Error("The PINs do not match");const {error}=await B().db.rpc("set_my_signing_pin",{p_pin:pin});if(error)throw error;form.reset();B().toast("Your private signing PIN has been saved")}catch(error){B().toast(error.message)}};
 q("#change-password-form").onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;try{const password=q("#new-account-password").value,confirmPassword=q("#confirm-account-password").value;if(password.length<10)throw new Error("Use at least ten characters");if(password!==confirmPassword)throw new Error("The passwords do not match");const {error}=await B().db.auth.updateUser({password});if(error)throw error;form.reset();B().toast("Your password has been changed")}catch(error){B().toast(error.message)}};
}
async function setPersonRole(personId,role,participantId){
 if(["family","client"].includes(role)&&!participantId)throw new Error("Choose the participant linked to this portal account");
 await invoke({action:"set-role",user_id:personId,role,participant_id:["family","client"].includes(role)?participantId:null});
 await loadDirectory();
 B().toast("Florence role updated");
}
document.addEventListener("click",async event=>{
 try{
  if(event.target.closest("#retry-staff-directory")){await loadDirectory();return}
  const toggle=event.target.closest("[data-toggle-worker]");
  if(toggle){const active=toggle.dataset.active==="true";if(!confirm(`${active?"Reactivate":"Deactivate"} this person’s Florence access?`))return;await invoke({action:"set-active",user_id:toggle.dataset.toggleWorker,active});await loadDirectory();return B().toast(active?"Account reactivated":"Account deactivated")}
  const resend=event.target.closest("[data-resend-worker]");
  if(resend){const person=directory.find(item=>item.id===resend.dataset.resendWorker);if(!person?.email)throw new Error("This account has no email address");const {error}=await B().db.auth.resetPasswordForEmail(person.email,{redirectTo:location.origin+location.pathname});if(error)throw error;return B().toast("Access email sent")}
 }catch(error){B().toast(error.message)}
});
document.addEventListener("change",async event=>{
 const access=event.target.closest("[data-participant-access]");
 if(access){access.disabled=true;try{const staffId=access.dataset.participantAccess,participantId=access.dataset.participantId;if(access.checked){const {error}=await B().db.from("participant_access_assignments").insert({organisation_id:B().profile.organisation_id,participant_id:participantId,staff_id:staffId,granted_by:B().profile.id,reason:"Ongoing support assignment"});if(error)throw error;B().toast("Participant access granted")}else{const {error}=await B().db.from("participant_access_assignments").update({active:false,revoked_by:B().profile.id,revoked_at:new Date().toISOString()}).eq("staff_id",staffId).eq("participant_id",participantId).eq("active",true);if(error)throw error;B().toast("Participant access revoked")}await loadDirectory()}catch(error){B().toast(error.message);access.checked=!access.checked;access.disabled=false}return}
 const roleSelect=event.target.closest("[data-person-role]");
 if(roleSelect){try{const personId=roleSelect.dataset.personRole,role=roleSelect.value,card=roleSelect.closest(".staff-card"),participant=card.querySelector(`[data-person-participant="${personId}"]`);participant.disabled=!["family","client"].includes(role);if(["family","client"].includes(role)&&!participant.value){B().toast("Now choose the participant linked to this portal account");return}await setPersonRole(personId,role,participant.value||null)}catch(error){B().toast(error.message);await loadDirectory()}return}
 const participantSelect=event.target.closest("[data-person-participant]");
 if(participantSelect){try{const personId=participantSelect.dataset.personParticipant,card=participantSelect.closest(".staff-card"),role=card.querySelector(`[data-person-role="${personId}"]`).value;if(!["family","client"].includes(role))return;if(!participantSelect.value)throw new Error("Choose a participant for this portal account");await setPersonRole(personId,role,participantSelect.value)}catch(error){B().toast(error.message);await loadDirectory()}return}
});
window.addEventListener("florence:ready",()=>{document.querySelectorAll(".staff-only").forEach(element=>element.classList.toggle("hidden",!B().isStaffUser()));if(B().isSupervisor()){bindInvite();loadDirectory()}if(B().isStaffUser())bindAccountForms()});
})();
