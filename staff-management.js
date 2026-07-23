(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=s=>document.querySelector(s);
let directory=[];
const roleLabel=role=>role==="supervisor"?"Supervisor":"Support worker";
const accountStatus=worker=>!worker.active?"Inactive":worker.banned_until?"Suspended":worker.last_sign_in_at?"Active":"Invited";
async function invoke(body){
 const {data,error}=await B().db.functions.invoke("staff-management",{body});
 if(error)throw new Error(data?.error||error.message||"Staff management is unavailable");
 if(data?.error)throw new Error(data.error);
 return data;
}
async function loadDirectory(){
 if(!B().isSupervisor())return;
 try{
  const data=await invoke({action:"list"});
  directory=data.staff||[];
  renderDirectory();
 }catch(error){
  q("#staff-directory").innerHTML=`<div class="notice"><strong>Staff setup required.</strong><br>${B().esc(error.message)} Run the staff-management setup package before inviting workers.</div>`;
 }
}
function renderDirectory(){
 const target=q("#staff-directory");
 if(!target)return;
 target.innerHTML=directory.map(worker=>{
  const status=accountStatus(worker);
  const last=worker.last_sign_in_at?`Last sign-in ${B().fmt(worker.last_sign_in_at)}`:"Invitation not yet accepted";
  return `<article class="record staff-card ${worker.active?"":"inactive"}">
   <div class="record-top"><div><h3>${B().esc(worker.full_name)}</h3><p class="staff-email">${B().esc(worker.email||"No email")}</p></div>${B().badge(status)}</div>
   <div class="staff-invite-status">${B().badge(roleLabel(worker.role))}<span class="badge">${B().esc(last)}</span></div>
   <div class="actions">
    <select data-worker-role="${worker.id}" aria-label="Role for ${B().esc(worker.full_name)}">
     <option value="staff" ${worker.role==="staff"?"selected":""}>Support worker</option>
     <option value="supervisor" ${worker.role==="supervisor"?"selected":""}>Supervisor</option>
    </select>
    <button class="secondary" data-resend-worker="${worker.id}">Resend access email</button>
    <button class="${worker.active?"decline":"accept"}" data-toggle-worker="${worker.id}" data-active="${worker.active?"false":"true"}">${worker.active?"Deactivate":"Reactivate"}</button>
   </div>
  </article>`;
 }).join("")||B().empty("No staff accounts yet.");
}
function bindInvite(){
 q("#invite-worker").onclick=()=>B().form("Invite worker",[
  B().field("full_name","Worker’s full name"),
  B().field("email","Worker’s email","email"),
  B().field("role","Florence access","select",[{value:"staff",label:"Support worker"},{value:"supervisor",label:"Supervisor"}])
 ],async values=>{
  await invoke({action:"invite",full_name:values.full_name.trim(),email:values.email.trim().toLowerCase(),role:values.role});
  await loadDirectory();
  B().toast("Invitation sent securely");
 });
}
function bindAccountForms(){
 q("#set-pin-form").onsubmit=async event=>{
  event.preventDefault();
  try{
   const pin=q("#new-signing-pin").value,confirmPin=q("#confirm-signing-pin").value;
   if(!/^\d{6}$/.test(pin))throw new Error("Enter exactly six numbers");
   if(pin!==confirmPin)throw new Error("The PINs do not match");
   const {error}=await B().db.rpc("set_my_signing_pin",{p_pin:pin});
   if(error)throw error;
   event.currentTarget.reset();
   B().toast("Your private signing PIN has been saved");
  }catch(error){B().toast(error.message)}
 };
 q("#change-password-form").onsubmit=async event=>{
  event.preventDefault();
  try{
   const password=q("#new-account-password").value,confirmPassword=q("#confirm-account-password").value;
   if(password.length<10)throw new Error("Use at least ten characters");
   if(password!==confirmPassword)throw new Error("The passwords do not match");
   const {error}=await B().db.auth.updateUser({password});
   if(error)throw error;
   event.currentTarget.reset();
   B().toast("Your password has been changed");
  }catch(error){B().toast(error.message)}
 };
}
document.addEventListener("click",async event=>{
 try{
  const toggle=event.target.closest("[data-toggle-worker]");
  if(toggle){
   const active=toggle.dataset.active==="true";
   if(!confirm(`${active?"Reactivate":"Deactivate"} this worker’s Florence access?`))return;
   await invoke({action:"set-active",user_id:toggle.dataset.toggleWorker,active});
   await loadDirectory();
   return B().toast(active?"Worker reactivated":"Worker deactivated");
  }
  const resend=event.target.closest("[data-resend-worker]");
  if(resend){
   const worker=directory.find(x=>x.id===resend.dataset.resendWorker);
   if(!worker?.email)throw new Error("This worker has no email address");
   const {error}=await B().db.auth.resetPasswordForEmail(worker.email,{redirectTo:location.origin+location.pathname});
   if(error)throw error;
   return B().toast("Access email sent");
  }
 }catch(error){B().toast(error.message)}
});
document.addEventListener("change",async event=>{
 const select=event.target.closest("[data-worker-role]");
 if(!select)return;
 try{
  await invoke({action:"set-role",user_id:select.dataset.workerRole,role:select.value});
  await loadDirectory();
  B().toast("Worker role updated");
 }catch(error){B().toast(error.message);await loadDirectory()}
});
window.addEventListener("florence:ready",()=>{
 document.querySelectorAll(".staff-only").forEach(element=>element.classList.toggle("hidden",!B().isStaffUser()));
 if(B().isSupervisor()){bindInvite();loadDirectory()}
 if(B().isStaffUser())bindAccountForms();
});
})();
