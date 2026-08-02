(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const isPortal=()=>["family","client"].includes(B()?.profile?.role);
const fields=[
 ["Communication needs","communication_needs"],
 ["Diagnoses","diagnoses"],
 ["Allergies","allergies"],
 ["Goals","goals"],
 ["Preferences","preferences"],
 ["Risks and safeguards","risks_and_safeguards"],
 ["Emergency contact","emergency_contact"],
 ["Guardian or nominee","guardian_nominee"],
 ["GP","gp"],
 ["Pharmacy","pharmacy"]
];
function render(participant){
 const portal=document.querySelector("#portal-view");
 if(!portal||!isPortal())return;
 let panel=document.querySelector("#portal-care-plan-panel");
 if(!panel){
  panel=document.createElement("article");
  panel.id="portal-care-plan-panel";
  panel.className="panel portal-care-plan";
  const layout=portal.querySelector(".portal-layout");
  (layout||portal).insertAdjacentElement("beforebegin",panel);
 }
 const name=participant?.preferred_name||participant?.full_name||"Participant";
 const available=fields.filter(([,key])=>String(participant?.[key]||"").trim());
 panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Approved participant information</p><h3>${esc(name)}’s care plan</h3><p>This summary is taken from the current Florence participant profile. Contact I-Care Connect if anything needs updating.</p></div></div>${available.length?`<div class="care-plan-grid">${available.map(([label,key])=>`<section class="care-plan-item"><h4>${esc(label)}</h4><p>${esc(participant[key]).replace(/\n/g,"<br>")}</p></section>`).join("")}</div>`:'<div class="empty">The care plan summary has not been completed yet.</div>'}`;
}
async function load(){
 if(!isPortal())return;
 const bridge=B();
 const participantId=bridge.profile?.participant_id;
 if(!participantId)return;
 const cached=bridge.state?.participants?.find(item=>item.id===participantId);
 if(cached){render(cached);return}
 const {data,error}=await bridge.db.from("participants").select("id,full_name,preferred_name,communication_needs,diagnoses,allergies,goals,preferences,risks_and_safeguards,emergency_contact,guardian_nominee,gp,pharmacy").eq("id",participantId).single();
 if(error){console.warn("Florence care plan unavailable",error.message);return}
 render(data);
}
window.addEventListener("florence:ready",()=>void load());
document.addEventListener("click",event=>{if(event.target.closest('[data-view="portal"]'))setTimeout(()=>void load(),50)});
const style=document.createElement("style");
style.textContent=`.portal-care-plan{margin-bottom:20px}.care-plan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.care-plan-item{padding:16px;border:1px solid rgba(95,143,114,.22);border-radius:16px;background:#f8fbf8}.care-plan-item h4{margin:0 0 8px;color:#29543c}.care-plan-item p{margin:0;white-space:normal;line-height:1.55}`;
document.head.appendChild(style);
})();
