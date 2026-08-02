(()=>{
"use strict";

function esc(value){
 return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
}

function renderLinkedParticipant(){
 const bridge=window.FlorenceBridge;
 const profile=bridge?.profile;
 const portalView=document.querySelector("#portal-view");
 if(!bridge||!profile||!portalView||!["family","client"].includes(profile.role))return false;

 const participant=bridge.state?.participants?.find(item=>item.id===profile.participant_id)
  || bridge.state?.participants?.[0]
  || null;
 const existing=document.querySelector("#portal-linked-participant");
 if(!participant){existing?.remove();return false}

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

let attempts=0;
const timer=setInterval(()=>{
 attempts++;
 if(renderLinkedParticipant()||attempts>80)clearInterval(timer);
},250);
window.addEventListener("florence:ready",renderLinkedParticipant);
document.addEventListener("click",event=>{
 if(event.target.closest('[data-view="portal"]'))setTimeout(renderLinkedParticipant,50);
});
})();
