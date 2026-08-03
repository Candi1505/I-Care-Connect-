(()=>{
"use strict";
const q=s=>document.querySelector(s);
const B=()=>window.FlorenceBridge;
let binding=false;

function toast(message){
 const b=B();
 if(b?.toast)return b.toast(message);
 const el=q("#toast");
 if(!el)return;
 el.textContent=message;
 el.classList.add("show");
 setTimeout(()=>el.classList.remove("show"),2800);
}

async function refreshFlorence(){
 const buttons=[...document.querySelectorAll("[data-refresh-florence]")];
 buttons.forEach(button=>{button.disabled=true;button.setAttribute("aria-busy","true")});
 toast("Refreshing Florence…");
 try{
  if("serviceWorker" in navigator){
   const registrations=await navigator.serviceWorker.getRegistrations();
   await Promise.all(registrations.map(registration=>registration.update().catch(()=>null)));
  }
  if("caches" in window){
   const keys=await caches.keys();
   await Promise.all(keys.filter(key=>key.startsWith("florence-")).map(key=>caches.delete(key)));
  }
 }finally{
  const url=new URL(location.href);
  url.searchParams.set("florence_refresh",Date.now().toString());
  location.replace(url.toString());
 }
}

function ensureRefreshControls(){
 const topbar=q(".topbar");
 if(topbar&&!q("#refresh-florence")){
  topbar.style.gridTemplateColumns="48px minmax(0,1fr) 48px 48px";
  const button=document.createElement("button");
  button.id="refresh-florence";
  button.type="button";
  button.className="icon-btn";
  button.dataset.refreshFlorence="true";
  button.title="Refresh Florence";
  button.setAttribute("aria-label","Refresh Florence");
  button.textContent="↻";
  const bell=q("#bell");
  if(bell)topbar.insertBefore(button,bell);else topbar.appendChild(button);
 }
 const drawer=q("#drawer");
 if(drawer&&!q("#refresh-florence-menu")){
  const button=document.createElement("button");
  button.id="refresh-florence-menu";
  button.type="button";
  button.dataset.refreshFlorence="true";
  button.textContent="↻ Refresh Florence";
  const logout=q("#logout");
  if(logout)drawer.insertBefore(button,logout);else drawer.appendChild(button);
 }
 document.querySelectorAll("[data-refresh-florence]").forEach(button=>{
  if(button.dataset.refreshBound==="true")return;
  button.dataset.refreshBound="true";
  button.addEventListener("click",()=>void refreshFlorence());
 });
}

async function loadNotifications(){
 const b=B();
 if(!b?.db||!b?.profile)return [];
 const {data,error}=await b.db.from("notifications")
  .select("id,title,body,category,related_record_id,read_at,created_at")
  .eq("recipient_id",b.profile.id)
  .order("created_at",{ascending:false})
  .limit(100);
 if(error)throw error;
 return data||[];
}

function openRoster(notification){
 q('[data-view="roster"]')?.click();
 setTimeout(()=>{
  q('[data-roster-tab="mine"]')?.click();
  if(notification.related_record_id){
   const target=q(`[data-shift-id="${notification.related_record_id}"]`)||q(`[data-shift="${notification.related_record_id}"]`);
   target?.scrollIntoView({behavior:"smooth",block:"center"});
  }
 },150);
}

async function openNotification(notification,card){
 const b=B();
 if(!b?.db)return;
 try{
  if(!notification.read_at){
   const readAt=new Date().toISOString();
   const {error}=await b.db.from("notifications").update({read_at:readAt}).eq("id",notification.id);
   if(error)throw error;
   notification.read_at=readAt;
  }
  if(String(notification.category||"").toLowerCase()==="roster")openRoster(notification);
  else toast("Notification marked as read");
 }catch(error){toast(error?.message||"Florence could not open this notification")}
}

async function bindNotificationCards(){
 if(binding)return;
 const list=q("#notification-list");
 if(!list||!B()?.profile)return;
 binding=true;
 try{
  const notifications=await loadNotifications();
  const cards=[...list.children].filter(node=>node instanceof HTMLElement);
  cards.forEach((card,index)=>{
   const notification=notifications[index];
   if(!notification)return;
   card.tabIndex=0;
   card.setAttribute("role","button");
   card.style.cursor="pointer";
   card.dataset.notificationId=notification.id;
   if(!card.querySelector("[data-notification-open-label]")){
    const hint=document.createElement("div");
    hint.dataset.notificationOpenLabel="true";
    hint.className="record-meta";
    hint.textContent=String(notification.category||"").toLowerCase()==="roster"?"Tap to open My shifts":"Tap to open";
    card.appendChild(hint);
   }
   if(card.dataset.notificationBound==="true")return;
   card.dataset.notificationBound="true";
   card.addEventListener("click",()=>void openNotification(notification,card));
   card.addEventListener("keydown",event=>{
    if(!["Enter"," "].includes(event.key))return;
    event.preventDefault();
    void openNotification(notification,card);
   });
  });
 }catch(_error){}finally{binding=false}
}

function handleDeepLink(){
 const view=new URL(location.href).searchParams.get("view");
 if(view!=="roster")return;
 let attempts=0;
 const timer=setInterval(()=>{
  attempts+=1;
  const button=q('[data-view="roster"]');
  if(button){button.click();setTimeout(()=>q('[data-roster-tab="mine"]')?.click(),100);clearInterval(timer)}
  if(attempts>80)clearInterval(timer);
 },250);
}

function start(){
 ensureRefreshControls();
 void bindNotificationCards();
 handleDeepLink();
 const list=q("#notification-list");
 if(list&&!list.__florenceCoreObserver){
  const observer=new MutationObserver(()=>void bindNotificationCards());
  observer.observe(list,{childList:true});
  list.__florenceCoreObserver=observer;
 }
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("florence:ready",start);
window.addEventListener("pageshow",start);
document.addEventListener("click",event=>{
 const target=event.target instanceof Element?event.target:null;
 if(target?.closest('[data-view="governance"]'))setTimeout(()=>void bindNotificationCards(),150);
});
window.FlorenceRefresh=refreshFlorence;
})();

(()=>{
"use strict";
const q=(selector,root=document)=>root.querySelector(selector);
const B=()=>window.FlorenceBridge;
const keys=["full_name","preferred_name","date_of_birth","ndis_number","address","phone","emergency_contact","guardian_nominee","gp","pharmacy","communication_needs","diagnoses","allergies","goals","preferences","risks_and_safeguards"];
function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2800)}
async function openEditor(){
 const b=B();if(!b?.db||!b?.profile)throw new Error("Florence is still loading your secure account.");
 if(b.profile.role!=="supervisor")throw new Error("Only supervisors can edit participant details.");
 const participantId=q("#pf-select")?.value||q("#participant-file-select")?.value||"";if(!participantId)throw new Error("Choose a participant first.");
 const {data:p,error}=await b.db.from("participants").select("*").eq("id",participantId).single();if(error||!p)throw error||new Error("Participant record not found.");
 const f=b.field;
 const fields=[f("full_name","Full legal name","text",[],true),f("preferred_name","Preferred name","text",[],false),f("date_of_birth","Date of birth","date",[],false),f("ndis_number","NDIS number","text",[],false),f("address","Residential address","textarea",[],false),f("phone","Participant phone","text",[],false),f("emergency_contact","Emergency contact details","textarea",[],false),f("guardian_nominee","Guardian or nominee","textarea",[],false),f("gp","GP / doctor details","textarea",[],false),f("pharmacy","Pharmacy details","textarea",[],false),f("communication_needs","Communication needs","textarea",[],false),f("diagnoses","Diagnoses","textarea",[],false),f("allergies","Allergies","textarea",[],false),f("goals","Goals","textarea",[],false),f("preferences","Preferences and routines","textarea",[],false),f("risks_and_safeguards","Risks and safeguards","textarea",[],false)];
 const values=Object.fromEntries(keys.map(key=>[key,p[key]??""]));
 b.form(`Edit ${p.preferred_name||p.full_name}`,fields,async values=>{
  const payload={};for(const key of keys){const value=String(values[key]??"").trim();payload[key]=key==="date_of_birth"?(value||null):(value||null)}
  if(!payload.full_name)throw new Error("Full legal name is required.");payload.updated_at=new Date().toISOString();
  const {error:updateError}=await b.db.from("participants").update(payload).eq("id",participantId);if(updateError)throw updateError;
  await b.refreshAll?.();setTimeout(()=>window.FlorenceRefresh?.(),500);return "Participant details updated";
 },values);
}
function ensureEditButton(){
 const b=B(),hero=q("#pf-content .pf-hero")||q("#participant-file-content .pf-hero")||q("#participant-file-content .participant-file-hero");if(!hero||!b?.profile)return;
 const existing=q("#edit-participant-details",hero);if(b.profile.role!=="supervisor"){existing?.remove();return}if(existing)return;
 const action=hero.lastElementChild||hero;const button=document.createElement("button");button.id="edit-participant-details";button.type="button";button.className="secondary pf-core-edit";button.textContent="Edit participant";
 button.onclick=event=>{event.preventDefault();event.stopPropagation();button.disabled=true;void openEditor().catch(error=>toast(error?.message||"Florence could not open participant editing.")).finally(()=>button.disabled=false)};action.appendChild(button);
}
function startEdit(){ensureEditButton();const host=q("#pf-content")||q("#participant-file-content");if(host&&!host.__coreEditObserver){new MutationObserver(ensureEditButton).observe(host,{childList:true,subtree:true});host.__coreEditObserver=true}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startEdit,{once:true});else startEdit();window.addEventListener("florence:ready",startEdit);window.addEventListener("pageshow",startEdit);setInterval(startEdit,1000);
const style=document.createElement("style");style.textContent='.pf-hero>div:last-child,.participant-file-hero>div:last-child{display:flex;flex-direction:column;align-items:flex-end;gap:10px}.pf-core-edit{background:#fff!important;color:#315d46!important;border-color:#fff!important;white-space:nowrap}';document.head.appendChild(style);
})();
