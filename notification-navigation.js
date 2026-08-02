(()=>{
"use strict";
const q=s=>document.querySelector(s);
const B=()=>window.FlorenceBridge;
let binding=false;
let deepLinkHandled=false;

function toast(message){
 const b=B();
 if(b?.toast)return b.toast(message);
 const el=q("#toast");
 if(!el)return;
 el.textContent=message;
 el.classList.add("show");
 setTimeout(()=>el.classList.remove("show"),2600);
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

function openRoster(notification={}){
 const rosterButton=document.querySelector('[data-view="roster"]');
 rosterButton?.click();
 setTimeout(()=>{
  const mine=document.querySelector('[data-roster-tab="mine"]');
  mine?.click();
  const shiftId=notification.related_record_id||new URL(location.href).searchParams.get("shift");
  if(shiftId){
   const target=document.querySelector(`[data-shift-id="${shiftId}"]`)
    ||document.querySelector(`[data-shift="${shiftId}"]`);
   target?.scrollIntoView({behavior:"smooth",block:"center"});
  }
 },160);
}

function handleDeepLink(){
 if(deepLinkHandled||!B()?.profile)return;
 const url=new URL(location.href);
 const view=url.searchParams.get("view");
 if(view!=="roster")return;
 deepLinkHandled=true;
 openRoster({related_record_id:url.searchParams.get("shift")});
 url.searchParams.delete("view");
 url.searchParams.delete("shift");
 history.replaceState(null,"",url.pathname+(url.search?url.search:"")+url.hash);
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
   card?.classList.add("notification-read");
   const badge=card?.querySelector(".badge");
   if(badge)badge.textContent="Read";
  }
  if(String(notification.category||"").toLowerCase()==="roster"){
   openRoster(notification);
   return;
  }
  toast("Notification marked as read");
 }catch(error){
  toast(error?.message||"Florence could not open this notification");
 }
}

async function bindCards(){
 if(binding)return;
 const list=q("#notification-list");
 const b=B();
 if(!list||!b?.profile)return;
 binding=true;
 try{
  const notifications=await loadNotifications();
  const cards=[...list.children].filter(node=>node instanceof HTMLElement);
  cards.forEach((card,index)=>{
   const notification=notifications[index];
   if(!notification)return;
   card.dataset.notificationId=notification.id;
   card.dataset.notificationCategory=notification.category||"";
   card.dataset.relatedRecordId=notification.related_record_id||"";
   card.tabIndex=0;
   card.setAttribute("role","button");
   card.setAttribute("aria-label",`${notification.title}. Open notification`);
   card.style.cursor="pointer";
   if(!card.querySelector("[data-notification-open-label]")){
    const hint=document.createElement("span");
    hint.dataset.notificationOpenLabel="true";
    hint.className="record-meta notification-open-hint";
    hint.textContent=String(notification.category||"").toLowerCase()==="roster"?"Tap to open My shifts":"Tap to open";
    card.appendChild(hint);
   }
   if(card.dataset.notificationBound==="true")return;
   card.dataset.notificationBound="true";
   const activate=event=>{
    if(event.type==="keydown"&&!['Enter',' '].includes(event.key))return;
    if(event.type==="keydown")event.preventDefault();
    void openNotification(notification,card);
   };
   card.addEventListener("click",activate);
   card.addEventListener("keydown",activate);
  });
 }catch(_error){
  // Keep the existing notifications visible even if navigation binding cannot load.
 }finally{
  binding=false;
 }
}

function start(){
 handleDeepLink();
 void bindCards();
 const list=q("#notification-list");
 if(list&&!list.__florenceNotificationObserver){
  const observer=new MutationObserver(()=>void bindCards());
  observer.observe(list,{childList:true,subtree:false});
  list.__florenceNotificationObserver=observer;
 }
 document.addEventListener("click",event=>{
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest('[data-view="governance"]'))setTimeout(()=>void bindCards(),120);
 });
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});
else start();
window.addEventListener("florence:ready",start);
window.addEventListener("pageshow",start);
})();
