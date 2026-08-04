(()=>{
"use strict";

const C=window.FLORENCE_CONFIG||{};
let resolved=null;
let client=null;

function esc(value){
 return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
}

async function resolvePortalContext(){
 const bridge=window.FlorenceBridge;
 if(bridge?.profile){
  const participant=bridge.state?.participants?.find(item=>item.id===bridge.profile.participant_id)
   || bridge.state?.participants?.[0]
   || null;
  if(participant)return {profile:bridge.profile,participant};
 }
 if(resolved)return resolved;
 if(!window.supabase?.createClient||!C.supabaseUrl||!C.supabaseAnonKey)return null;
 client=client||window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
 const {data:{session}}=await client.auth.getSession();
 if(!session?.user?.id)return null;
 const {data:profile,error:profileError}=await client.from("profiles").select("id,role,participant_id,organisation_id").eq("id",session.user.id).single();
 if(profileError||!profile||!["family","client"].includes(profile.role)||!profile.participant_id)return null;
 const {data:participant,error:participantError}=await client.from("participants").select("id,full_name,preferred_name").eq("id",profile.participant_id).single();
 if(participantError||!participant)return null;
 resolved={profile,participant};
 return resolved;
}

async function renderLinkedParticipant(){
 const portalView=document.querySelector("#portal-view");
 if(!portalView)return false;
 const context=await resolvePortalContext().catch(()=>null);
 const existing=document.querySelector("#portal-linked-participant");
 if(!context){existing?.remove();return false}
 const {profile,participant}=context;
 const name=participant.preferred_name||participant.full_name||"Linked participant";
 const label=profile.role==="family"?"Family portal for":"Participant portal for";
 const banner=existing||document.createElement("article");
 banner.id="portal-linked-participant";
 banner.className="panel portal-participant-banner";
 banner.setAttribute("aria-label",`${label} ${name}`);
 banner.innerHTML=`<p class="eyebrow">Linked participant</p><h3>${esc(label)} ${esc(name)}</h3><p>This portal is securely linked only to ${esc(name)}.</p>`;
 if(!existing){
  const pageHead=portalView.querySelector(".page-head");
  pageHead?.insertAdjacentElement("afterend",banner);
 }
 return true;
}

const style=document.createElement("style");
style.textContent=`
.portal-participant-banner{margin-bottom:18px;border:2px solid rgba(95,143,114,.35);background:linear-gradient(135deg,#f4faf6,#fff)}
.portal-participant-banner h3{margin:.25rem 0 .35rem;color:#21573d}
.portal-participant-banner p:last-child{margin:0}
`;
document.head.appendChild(style);

function start(){
 let attempts=0;
 const timer=setInterval(async()=>{
  attempts++;
  if(await renderLinkedParticipant()||attempts>80)clearInterval(timer);
 },250);
}
window.addEventListener("florence:ready",start);
document.addEventListener("click",event=>{
 if(event.target.closest('[data-view="portal"]'))setTimeout(()=>void renderLinkedParticipant(),50);
});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
else start();
})();
