(()=>{
"use strict";
const C=window.FLORENCE_CONFIG||{};
const B=()=>window.FlorenceBridge;
const q=s=>document.querySelector(s);
const vapid=String(C.pushVapidPublicKey||"");
const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent);
const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
function decodeKey(value){
 const padding="=".repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,"+").replace(/_/g,"/");
 return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
}
function message(){
 if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))return "This device does not support Florence push notifications.";
 if(isiOS&&!standalone)return "On iPhone, tap Share → Add to Home Screen, open Florence from the new icon, then enable notifications.";
 if(Notification.permission==="denied")return "Notifications are blocked in this device’s settings. Allow Florence notifications, then return here.";
 if(Notification.permission==="granted")return "Push notifications are enabled on this device.";
 return "Enable private Florence alerts for shifts, clocking, medication tasks and new progress notes.";
}
async function existingSubscription(){
 const registration=await navigator.serviceWorker.ready;
 return registration.pushManager.getSubscription();
}
async function saveSubscription(subscription){
 const data=subscription.toJSON();
 const payload={
  organisation_id:B().profile.organisation_id,
  user_id:B().profile.id,
  endpoint:data.endpoint,
  p256dh:data.keys?.p256dh,
  auth_secret:data.keys?.auth,
  user_agent:navigator.userAgent,
  active:true,
  updated_at:new Date().toISOString()
 };
 const {error}=await B().db.from("push_subscriptions").upsert(payload,{onConflict:"endpoint"});
 if(error)throw error;
}
async function enable(){
 if(isiOS&&!standalone)throw new Error("Add Florence to your iPhone Home Screen first, then open it from the Florence icon.");
 if(!vapid)throw new Error("Florence push configuration is incomplete.");
 const permission=await Notification.requestPermission();
 if(permission!=="granted")throw new Error("Notification permission was not granted.");
 const registration=await navigator.serviceWorker.ready;
 let subscription=await registration.pushManager.getSubscription();
 if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(vapid)});
 await saveSubscription(subscription);
 await registration.showNotification("Florence notifications enabled",{body:"Private shift, clocking and care-task alerts can now reach this device.",icon:"./florence-icon.svg",badge:"./florence-icon.svg",tag:"florence-enabled",data:{url:"./"}});
}
async function disable(){
 const subscription=await existingSubscription();
 if(subscription){
  await B().db.from("push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("endpoint",subscription.endpoint).eq("user_id",B().profile.id);
  await subscription.unsubscribe();
 }
}
async function render(){
 if(!B()?.profile||!["staff","supervisor"].includes(B().profile.role))return;
 const host=q("#my-account-view")||q("#dashboard-view");if(!host)return;
 let panel=q("#push-notification-panel");
 if(!panel){
  panel=document.createElement("article");panel.id="push-notification-panel";panel.className="panel staff-only";
  panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Device alerts</p><h3>Push notifications</h3><p id="push-notification-message"></p></div><span id="push-notification-status" class="badge">Checking…</span></div><div class="actions"><button id="enable-push-notifications" type="button" class="primary">Enable notifications</button><button id="disable-push-notifications" type="button" class="secondary">Disable on this device</button></div><p class="record-meta">Lock-screen alerts do not show participant names, medication names or note contents.</p>`;
  host.prepend(panel);
 }
 const subscription=await existingSubscription().catch(()=>null),enabled=Notification.permission==="granted"&&Boolean(subscription);
 q("#push-notification-message").textContent=message();
 q("#push-notification-status").textContent=enabled?"Enabled":"Not enabled";
 q("#push-notification-status").className=`badge ${enabled?"good":"amber"}`;
 q("#enable-push-notifications").disabled=enabled;
 q("#disable-push-notifications").disabled=!subscription;
 q("#enable-push-notifications").onclick=async()=>{try{await enable();B().toast("Florence notifications enabled");await render()}catch(error){B().toast(error.message)}};
 q("#disable-push-notifications").onclick=async()=>{try{await disable();B().toast("Notifications disabled on this device");await render()}catch(error){B().toast(error.message)}};
}
window.addEventListener("florence:ready",()=>void render());
})();
