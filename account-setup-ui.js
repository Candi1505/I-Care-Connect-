(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const ROLES=[
 {value:"staff",label:"Support worker"},
 {value:"supervisor",label:"Supervisor"},
 {value:"family",label:"Family representative portal"},
 {value:"client",label:"Participant portal"}
];
async function invoke(body){
 const {data,error}=await B().db.functions.invoke("account-setup-admin",{body});
 if(error){
  let message=data?.error||error.message||"Account setup is unavailable";
  try{if(error.context instanceof Response){const payload=await error.context.clone().json();message=payload?.error||message}}catch(_ignored){}
  throw new Error(message);
 }
 if(data?.error)throw new Error(data.error);
 return data;
}
function showCode(result){
 const code=String(result.setup_code||"");
 if(!/^\d{8}$/.test(code))throw new Error("Florence did not return a valid setup code");
 const message=`One-time Florence setup code for ${result.email}:\n\n${code}\n\nThis code expires in ${result.expires_minutes||30} minutes. Share it privately with the person. They open Florence, tap Set up account with code, enter their email and this code, then create their password.`;
 window.prompt("Copy this one-time Florence setup code",message);
 navigator.clipboard?.writeText(code).catch(()=>{});
}
function bindInvite(){
 const button=document.querySelector("#invite-worker");
 if(!button)return;
 button.onclick=()=>B().form("Invite person",[
  B().field("full_name","Full name"),
  B().field("email","Email address","email"),
  B().field("role","Florence access","select",ROLES),
  B().field("participant_id","Linked participant (required for family or participant portal)","select",[{value:"",label:"Not applicable — worker or supervisor"},...B().state.participants.map(participant=>({value:participant.id,label:participant.full_name}))],false)
 ],async values=>{
  const email=values.email.trim().toLowerCase();
  if(["family","client"].includes(values.role)&&!values.participant_id)throw new Error("Choose the participant this portal account belongs to");
  const result=await invoke({action:"invite",full_name:values.full_name.trim(),email,role:values.role,participant_id:values.participant_id||null});
  showCode(result);
  return result.existing?"Account linked and a fresh one-time setup code created":"Account created and one-time setup code created";
 });
}
document.addEventListener("click",async event=>{
 const resend=event.target.closest("[data-resend-worker]");
 if(!resend||!B()?.isSupervisor?.())return;
 event.preventDefault();
 event.stopImmediatePropagation();
 try{
  const result=await invoke({action:"generate-code",user_id:resend.dataset.resendWorker});
  showCode(result);
  B().toast("Fresh one-time setup code created");
 }catch(error){B().toast(error.message)}
},true);
window.addEventListener("florence:ready",()=>{if(B().isSupervisor())setTimeout(bindInvite,0)});
})();
