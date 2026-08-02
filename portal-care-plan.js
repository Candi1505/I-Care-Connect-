(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const isPortal=()=>["family","client"].includes(B()?.profile?.role);
const fields=[["Communication needs","communication_needs"],["Diagnoses","diagnoses"],["Allergies","allergies"],["Goals","goals"],["Preferences","preferences"],["Risks and safeguards","risks_and_safeguards"],["Emergency contact","emergency_contact"],["Guardian or nominee","guardian_nominee"],["GP","gp"],["Pharmacy","pharmacy"]];
const date=value=>value?new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${String(value).slice(0,10)}T12:00:00`)):"Not recorded";
function render(participant){
 const portal=document.querySelector("#portal-view");
 if(!portal||!isPortal())return;
 let panel=document.querySelector("#portal-care-plan-panel");
 if(!panel){panel=document.createElement("article");panel.id="portal-care-plan-panel";panel.className="panel portal-care-plan";const layout=portal.querySelector(".portal-layout");(layout||portal).insertAdjacentElement("beforebegin",panel)}
 const name=participant?.preferred_name||participant?.full_name||"Participant";
 const available=fields.filter(([,key])=>String(participant?.[key]||"").trim());
 const approved=Boolean(participant?.care_plan_approved_at);
 panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">${approved?"Approved participant information":"Care plan summary"}</p><h3>${esc(name)}’s care plan</h3><p>This summary is taken from the current Florence participant profile. Contact I-Care Connect if anything needs updating.</p></div><span class="badge ${approved?"good":"amber"}">${approved?"Approved":"Approval pending"}</span></div><div class="record-meta care-plan-version"><span>Version ${Number(participant?.care_plan_version||1)}</span><span>Effective ${date(participant?.care_plan_effective_from)}</span><span>Review ${date(participant?.care_plan_review_date)}</span></div>${available.length?`<div class="care-plan-grid">${available.map(([label,key])=>`<section class="care-plan-item"><h4>${esc(label)}</h4><p>${esc(participant[key]).replace(/\n/g,"<br>")}</p></section>`).join("")}</div>`:'<div class="empty">The care plan summary has not been completed yet.</div>'}`;
}
async function load(){
 if(!isPortal())return;
 const bridge=B(),participantId=bridge?.profile?.participant_id;
 if(!participantId)return;
 const {data,error}=await bridge.db.from("participants").select("id,full_name,preferred_name,communication_needs,diagnoses,allergies,goals,preferences,risks_and_safeguards,emergency_contact,guardian_nominee,gp,pharmacy,care_plan_version,care_plan_effective_from,care_plan_review_date,care_plan_approved_at,care_plan_acknowledged_at").eq("id",participantId).single();
 if(error){console.warn("Florence care plan unavailable",error.message);return}
 render(data);
}
function wait(){let tries=0;const timer=setInterval(()=>{if(B()?.profile||tries++>80){clearInterval(timer);if(B()?.profile)void load()}},250)}
window.addEventListener("florence:ready",()=>void load(),{once:true});
document.addEventListener("click",event=>{if(event.target.closest('[data-view="portal"]'))setTimeout(()=>void load(),50)});
wait();
const style=document.createElement("style");style.textContent=`.portal-care-plan{margin-bottom:20px}.care-plan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.care-plan-item{padding:16px;border:1px solid rgba(95,143,114,.22);border-radius:16px;background:#f8fbf8}.care-plan-item h4{margin:0 0 8px;color:#29543c}.care-plan-item p{margin:0;white-space:normal;line-height:1.55}.care-plan-version{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 16px}`;document.head.appendChild(style);
})();
