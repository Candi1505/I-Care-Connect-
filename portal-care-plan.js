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

(()=>{
"use strict";
const q=s=>document.querySelector(s);
const bridge=()=>window.FlorenceBridge;
function toast(message){const b=bridge();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
async function refreshFlorence(){toast("Refreshing Florence…");try{if("serviceWorker" in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.update().catch(()=>null)))}if("caches" in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("florence-")).map(k=>caches.delete(k)))}}finally{const url=new URL(location.href);url.searchParams.set("florence_refresh",Date.now().toString());location.replace(url.toString())}}
function addRefresh(){
 const topbar=q(".topbar");
 if(topbar&&!q("#refresh-florence")){
  topbar.style.gridTemplateColumns="48px minmax(0,1fr) 48px 48px";
  const button=document.createElement("button");button.id="refresh-florence";button.type="button";button.className="icon-btn";button.textContent="↻";button.title="Refresh Florence";button.setAttribute("aria-label","Refresh Florence");button.onclick=()=>void refreshFlorence();
  const bell=q("#bell");bell?topbar.insertBefore(button,bell):topbar.appendChild(button);
 }
 const drawer=q("#drawer");
 if(drawer&&!q("#refresh-florence-menu")){
  const button=document.createElement("button");button.id="refresh-florence-menu";button.type="button";button.textContent="↻ Refresh Florence";button.onclick=()=>void refreshFlorence();
  const logout=q("#logout");logout?drawer.insertBefore(button,logout):drawer.appendChild(button);
 }
}
async function bindNotifications(){
 const b=bridge(),list=q("#notification-list");if(!b?.db||!b?.profile||!list)return;
 const {data,error}=await b.db.from("notifications").select("id,category,related_record_id,read_at,created_at").eq("recipient_id",b.profile.id).order("created_at",{ascending:false}).limit(100);if(error)return;
 [...list.children].forEach((card,index)=>{
  const item=(data||[])[index];if(!item||card.dataset.notificationBound==="true")return;
  card.dataset.notificationBound="true";card.style.cursor="pointer";card.tabIndex=0;card.setAttribute("role","button");
  const hint=document.createElement("div");hint.className="record-meta";hint.textContent=String(item.category||"").toLowerCase()==="roster"?"Tap to open My shifts":"Tap to open";card.appendChild(hint);
  const open=async()=>{if(!item.read_at){await b.db.from("notifications").update({read_at:new Date().toISOString()}).eq("id",item.id)}if(String(item.category||"").toLowerCase()==="roster"){q('[data-view="roster"]')?.click();setTimeout(()=>q('[data-roster-tab="mine"]')?.click(),120)}};
  card.addEventListener("click",()=>void open());card.addEventListener("keydown",event=>{if(!["Enter"," "].includes(event.key))return;event.preventDefault();void open()});
 });
}
function start(){addRefresh();void bindNotifications();const list=q("#notification-list");if(list&&!list.__florenceBound){const observer=new MutationObserver(()=>void bindNotifications());observer.observe(list,{childList:true});list.__florenceBound=true}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("florence:ready",start);window.addEventListener("pageshow",start);
document.addEventListener("click",event=>{const target=event.target instanceof Element?event.target:null;if(target?.closest('[data-view="governance"]'))setTimeout(()=>void bindNotifications(),120)});
window.FlorenceRefresh=refreshFlorence;
})();
