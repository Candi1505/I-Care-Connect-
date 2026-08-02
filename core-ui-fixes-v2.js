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
