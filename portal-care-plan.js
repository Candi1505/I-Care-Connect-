(()=>{
"use strict";
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],B=()=>window.FlorenceBridge;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const fmtDate=v=>v?new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${String(v).slice(0,10)}T12:00:00`)):"Not recorded";
const isPortal=()=>["family","client"].includes(B()?.profile?.role);
const careFields=[["Communication needs","communication_needs"],["Diagnoses","diagnoses"],["Allergies","allergies"],["Goals","goals"],["Preferences","preferences"],["Risks and safeguards","risks_and_safeguards"],["Emergency contact","emergency_contact"],["Guardian or nominee","guardian_nominee"],["GP","gp"],["Pharmacy","pharmacy"]];
function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
async function loadCarePlan(){
 if(!isPortal())return;
 const b=B(),participantId=b?.profile?.participant_id;if(!b?.db||!participantId)return;
 const {data,error}=await b.db.from("participants").select("id,full_name,preferred_name,communication_needs,diagnoses,allergies,goals,preferences,risks_and_safeguards,emergency_contact,guardian_nominee,gp,pharmacy,care_plan_version,care_plan_effective_from,care_plan_review_date,care_plan_approved_at").eq("id",participantId).single();
 if(error||!data)return;
 const portal=q("#portal-view");if(!portal)return;
 let panel=q("#portal-care-plan-panel");
 if(!panel){panel=document.createElement("article");panel.id="portal-care-plan-panel";panel.className="panel portal-care-plan";const layout=portal.querySelector(".portal-layout");(layout||portal).insertAdjacentElement("beforebegin",panel)}
 const available=careFields.filter(([,key])=>String(data[key]||"").trim()),approved=Boolean(data.care_plan_approved_at),name=data.preferred_name||data.full_name||"Participant";
 panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">${approved?"Approved participant information":"Care plan summary"}</p><h3>${esc(name)}’s care plan</h3><p>This summary is taken from the current Florence participant profile. Contact I-Care Connect if anything needs updating.</p></div><span class="badge ${approved?"good":"amber"}">${approved?"Approved":"Approval pending"}</span></div><div class="record-meta care-plan-version"><span>Version ${Number(data.care_plan_version||1)}</span><span>Effective ${fmtDate(data.care_plan_effective_from)}</span><span>Review ${fmtDate(data.care_plan_review_date)}</span></div>${available.length?`<div class="care-plan-grid">${available.map(([label,key])=>`<section class="care-plan-item"><h4>${esc(label)}</h4><p>${esc(data[key]).replace(/\n/g,"<br>")}</p></section>`).join("")}</div>`:'<div class="empty">The care plan summary has not been completed yet.</div>'}`;
}
async function refreshFlorence(){toast("Refreshing Florence…");try{if("serviceWorker" in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.all(regs.map(r=>r.update().catch(()=>null)))}if("caches" in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith("florence-")).map(k=>caches.delete(k)))}}finally{const url=new URL(location.href);url.searchParams.set("florence_refresh",Date.now().toString());location.replace(url.toString())}}
function addRefresh(){
 const topbar=q(".topbar");
 if(topbar&&!q("#refresh-florence")){topbar.style.gridTemplateColumns="48px minmax(0,1fr) 48px 48px";const button=document.createElement("button");button.id="refresh-florence";button.type="button";button.className="icon-btn";button.textContent="↻";button.title="Refresh Florence";button.setAttribute("aria-label","Refresh Florence");button.onclick=()=>void refreshFlorence();const bell=q("#bell");bell?topbar.insertBefore(button,bell):topbar.appendChild(button)}
 const drawer=q("#drawer");
 if(drawer&&!q("#refresh-florence-menu")){const button=document.createElement("button");button.id="refresh-florence-menu";button.type="button";button.textContent="↻ Refresh Florence";button.onclick=()=>void refreshFlorence();const logout=q("#logout");logout?drawer.insertBefore(button,logout):drawer.appendChild(button)}
}
function forceView(view){
 const trigger=qa(`[data-view="${view}"]`).find(el=>!el.classList.contains("hidden"));trigger?.click();
 setTimeout(()=>{const target=q(`#${view}-view`);if(!target)return;qa(".view").forEach(el=>el.classList.toggle("active",el===target));qa("[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===view));window.scrollTo({top:0,behavior:"smooth"})},30);
}
function destination(item){
 const value=`${item?.category||""} ${item?.title||""} ${item?.body||""}`.toLowerCase();
 if(/roster|shift/.test(value))return {view:"roster",hint:"Tap to open My shifts",after:()=>setTimeout(()=>q('[data-roster-tab="mine"]')?.click(),120)};
 if(/incident|safety|complaint/.test(value))return {view:"safety",hint:"Tap to open Incidents & complaints"};
 if(/medication|mar|prn|schedule.?8/.test(value))return {view:"medications",hint:"Tap to open MAR"};
 if(/progress|note|documentation/.test(value))return {view:"notes",hint:"Tap to open Progress notes"};
 if(/compliance|credential|document/.test(value))return {view:"compliance",hint:"Tap to open Compliance centre"};
 if(/portal|family|request|message/.test(value))return {view:"portal",hint:"Tap to open Portal"};
 if(/timeline|health|behaviour|fall/.test(value))return {view:"timeline",hint:"Tap to open Client timeline"};
 if(/timesheet|clock|workforce/.test(value))return {view:"workforce",hint:"Tap to open Timesheets"};
 return {view:"governance",hint:"Tap to open"};
}
async function bindNotifications(){
 const b=B(),list=q("#notification-list");if(!b?.db||!b?.profile||!list)return;
 const {data,error}=await b.db.from("notifications").select("id,title,body,category,related_record_id,read_at,created_at").eq("recipient_id",b.profile.id).order("created_at",{ascending:false}).limit(100);if(error)return;
 [...list.children].forEach((card,index)=>{const item=(data||[])[index];if(!item)return;const dest=destination(item);card.dataset.notificationId=item.id;card.style.cursor="pointer";card.tabIndex=0;card.setAttribute("role","button");let hint=card.querySelector("[data-notification-open-label]")||card.querySelector(".record-meta:last-child");if(!hint){hint=document.createElement("div");hint.className="record-meta";card.appendChild(hint)}hint.dataset.notificationOpenLabel="true";hint.textContent=dest.hint;card.__florenceNotification={item,dest}});
}
async function activateCard(card){
 const payload=card?.__florenceNotification,b=B();if(!payload||!b?.db)return;
 try{const {item,dest}=payload;if(!item.read_at){const readAt=new Date().toISOString(),{error}=await b.db.from("notifications").update({read_at:readAt}).eq("id",item.id);if(error)throw error;item.read_at=readAt}forceView(dest.view);dest.after?.()}catch(error){toast(error?.message||"Florence could not open this notification")}
}
function cardFromEvent(list,target){if(!(target instanceof Node))return null;return [...list.children].find(card=>card===target||card.contains(target))||null}
function start(){
 addRefresh();void loadCarePlan();void bindNotifications();const list=q("#notification-list");
 if(list&&!list.__florenceTapBound){
  list.__florenceTapBound=true;
  new MutationObserver(()=>void bindNotifications()).observe(list,{childList:true});
  list.addEventListener("click",event=>{const card=cardFromEvent(list,event.target);if(!card)return;event.preventDefault();event.stopImmediatePropagation();void activateCard(card)},true);
  list.addEventListener("keydown",event=>{if(!["Enter"," "].includes(event.key))return;const card=cardFromEvent(list,event.target);if(!card)return;event.preventDefault();event.stopImmediatePropagation();void activateCard(card)},true);
 }
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("florence:ready",start);window.addEventListener("pageshow",start);
document.addEventListener("click",event=>{const target=event.target instanceof Element?event.target:null;if(target?.closest('[data-view="portal"]'))setTimeout(()=>void loadCarePlan(),60);if(target?.closest('[data-view="governance"]'))setTimeout(()=>void bindNotifications(),120)});
window.FlorenceRefresh=refreshFlorence;
const style=document.createElement("style");style.textContent=`.portal-care-plan{margin-bottom:20px}.care-plan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.care-plan-item{padding:16px;border:1px solid rgba(95,143,114,.22);border-radius:16px;background:#f8fbf8}.care-plan-item h4{margin:0 0 8px;color:#29543c}.care-plan-item p{margin:0;line-height:1.55}.care-plan-version{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 16px}`;document.head.appendChild(style);
})();

(()=>{
 const load=()=>{
  if([...document.scripts].some(script=>(script.getAttribute("src")||"").includes("participant-file.js")))return;
  const script=document.createElement("script");
  script.src=`participant-file.js?v=20260803-1`;
  script.defer=true;
  document.head.appendChild(script);
 };
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",load,{once:true});else load();
})();
