(()=>{
"use strict";
const q=s=>document.querySelector(s);
const C=window.FLORENCE_CONFIG||{};
const isStandalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
let startY=0;

// Prevent iOS Home Screen pull-to-refresh from destroying the active app view.
if(isiOS&&isStandalone){
 document.documentElement.style.overscrollBehaviorY="none";
 document.body.style.overscrollBehaviorY="none";
 addEventListener("touchstart",event=>{startY=event.touches?.[0]?.clientY||0},{passive:true});
 addEventListener("touchmove",event=>{
  const y=event.touches?.[0]?.clientY||0;
  if(scrollY<=0&&y>startY&&!(event.target instanceof HTMLInputElement)&&!(event.target instanceof HTMLTextAreaElement))event.preventDefault();
 },{passive:false});
}

function bridge(){return window.FlorenceBridge}
function decodeKey(value){const padding="=".repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(base64),c=>c.charCodeAt(0))}
function supported(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window}
async function current(){
 if(!supported())return {supported:false};
 const registration=await navigator.serviceWorker.ready;
 const subscription=await registration.pushManager.getSubscription();
 const b=bridge();
 let saved=null;
 if(subscription&&b?.db&&b?.profile){
  const {data,error}=await b.db.from("push_subscriptions").select("id,active").eq("endpoint",subscription.endpoint).eq("user_id",b.profile.id).maybeSingle();
  if(error)throw error;
  saved=data||null;
 }
 return {supported:true,registration,subscription,saved};
}
async function save(subscription){
 const b=bridge();if(!b?.db||!b?.profile)throw new Error("Florence is still loading your account. Try again in a moment.");
 const data=subscription.toJSON();
 const {error}=await b.db.from("push_subscriptions").upsert({organisation_id:b.profile.organisation_id,user_id:b.profile.id,endpoint:data.endpoint,p256dh:data.keys?.p256dh,auth_secret:data.keys?.auth,user_agent:navigator.userAgent,active:true,updated_at:new Date().toISOString()},{onConflict:"endpoint"});
 if(error)throw error;
}
async function enable(){
 if(!supported())throw new Error("This device does not support Florence push notifications.");
 if(isiOS&&!isStandalone)throw new Error("Open Florence from its Home Screen icon before enabling notifications.");
 if(!C.pushVapidPublicKey)throw new Error("Florence push configuration is incomplete.");
 const permission=await Notification.requestPermission();if(permission!=="granted")throw new Error("Notification permission was not granted.");
 const registration=await navigator.serviceWorker.ready;
 let subscription=await registration.pushManager.getSubscription();
 if(subscription){await subscription.unsubscribe();subscription=null}
 subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(C.pushVapidPublicKey)});
 await save(subscription);
 await registration.showNotification("Florence notifications enabled",{body:"This device is now registered for private Florence alerts.",icon:"./florence-icon.svg",badge:"./florence-icon.svg",tag:"florence-enabled",data:{url:"./"}});
}
async function disable(){
 const state=await current();const b=bridge();
 if(state.subscription&&b?.db&&b?.profile)await b.db.from("push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("endpoint",state.subscription.endpoint).eq("user_id",b.profile.id);
 if(state.subscription)await state.subscription.unsubscribe();
}
async function test(){
 const state=await current();if(!state.subscription||!state.saved?.active)throw new Error("This device is not registered yet. Tap Enable notifications first.");
 await state.registration.showNotification("Florence device test",{body:"Push notifications are working on this device.",icon:"./florence-icon.svg",badge:"./florence-icon.svg",tag:"florence-device-test",data:{url:"./"}});
}
async function render(){
 const b=bridge();if(!b?.profile||!["staff","supervisor"].includes(b.profile.role))return false;
 const host=q("#my-account-view");if(!host)return false;
 let panel=q("#push-notification-panel");
 if(!panel){panel=document.createElement("article");panel.id="push-notification-panel";panel.className="panel staff-only";panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Device alerts</p><h3>Push notifications</h3><p id="push-notification-message">Checking this device…</p></div><span id="push-notification-status" class="badge amber">Checking…</span></div><div class="actions"><button id="enable-push-notifications" type="button" class="primary">Enable notifications</button><button id="test-push-notifications" type="button" class="secondary">Test this device</button><button id="disable-push-notifications" type="button" class="secondary">Disable on this device</button></div><p class="record-meta">Lock-screen alerts do not show participant names, medication names or note contents.</p>`;host.prepend(panel)}
 const state=await current().catch(()=>({supported:supported(),subscription:null,saved:null}));
 const registered=Boolean(state.subscription&&state.saved?.active),permission=window.Notification?.permission||"default";
 q("#push-notification-status").textContent=registered?"Registered":permission==="granted"?"Permission only":"Not enabled";
 q("#push-notification-status").className=`badge ${registered?"good":"amber"}`;
 q("#push-notification-message").textContent=!state.supported?"This device does not support Florence push notifications.":registered?"This device is securely registered for Florence alerts.":permission==="granted"?"Your phone allows alerts, but Florence still needs to register this device. Tap Enable notifications.":"Enable private alerts for shifts, medication tasks and care updates.";
 q("#enable-push-notifications").disabled=registered;
 q("#test-push-notifications").disabled=!registered;
 q("#disable-push-notifications").disabled=!state.subscription;
 q("#enable-push-notifications").onclick=async()=>{try{await enable();b.toast("Florence notifications enabled");await render()}catch(error){b.toast(error?.message||"Florence could not enable notifications")}};
 q("#test-push-notifications").onclick=async()=>{try{await test();b.toast("Test notification sent")}catch(error){b.toast(error?.message||"Florence could not test this device")}};
 q("#disable-push-notifications").onclick=async()=>{try{await disable();b.toast("Notifications disabled on this device");await render()}catch(error){b.toast(error?.message||"Florence could not disable notifications")}};
 return true;
}
function start(){let attempts=0;const timer=setInterval(()=>{attempts++;void render().then(done=>{if(done||attempts>=120)clearInterval(timer)})},250)}
window.addEventListener("florence:ready",start);
window.addEventListener("pageshow",start);
document.addEventListener("click",event=>{if(event.target.closest('[data-view="my-account"]'))setTimeout(start,50)});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
