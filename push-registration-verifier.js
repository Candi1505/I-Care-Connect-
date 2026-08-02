(()=>{
"use strict";
const q=s=>document.querySelector(s);
const B=()=>window.FlorenceBridge;
async function subscriptionState(){
 if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window))return {supported:false};
 const registration=await navigator.serviceWorker.ready;
 const subscription=await registration.pushManager.getSubscription();
 if(!subscription||Notification.permission!=="granted")return {supported:true,subscription:null,saved:null};
 const bridge=B();
 if(!bridge?.db||!bridge?.profile)return {supported:true,subscription,saved:null};
 const {data,error}=await bridge.db.from("push_subscriptions").select("id,active").eq("endpoint",subscription.endpoint).eq("user_id",bridge.profile.id).maybeSingle();
 if(error)throw error;
 return {supported:true,subscription,saved:data||null,registration};
}
async function render(){
 const panel=q("#push-notification-panel");
 if(!panel||!B()?.profile)return false;
 let button=q("#verify-push-registration");
 if(!button){
  button=document.createElement("button");
  button.id="verify-push-registration";
  button.type="button";
  button.className="secondary";
  button.textContent="Test this device";
  panel.querySelector(".actions")?.insertBefore(button,q("#disable-push-notifications"));
 }
 const state=await subscriptionState().catch(()=>({supported:true,subscription:null,saved:null}));
 const status=q("#push-notification-status"),message=q("#push-notification-message");
 const registered=Boolean(state.subscription&&state.saved?.active);
 if(status){status.textContent=registered?"Registered":Notification.permission==="granted"?"Permission only":"Not enabled";status.className=`badge ${registered?"good":"amber"}`}
 if(message&&Notification.permission==="granted"&&!registered)message.textContent="Your phone allows notifications, but this device is not registered with Florence yet. Tap Enable notifications again.";
 button.disabled=!registered;
 button.onclick=async()=>{
  try{
   const current=await subscriptionState();
   if(!current.subscription||!current.saved?.active)throw new Error("This device is not registered with Florence. Tap Enable notifications first.");
   await current.registration.showNotification("Florence device test",{body:"This device is correctly registered for Florence notifications.",icon:"./florence-icon.svg",badge:"./florence-icon.svg",tag:"florence-device-test",data:{url:"./"}});
   B().toast("Test notification sent");
  }catch(error){B().toast(error?.message||"Florence could not test this device")}
 };
 return true;
}
function start(){let attempts=0;const timer=setInterval(()=>{attempts++;void render().then(done=>{if(done||attempts>40)clearInterval(timer)})},400)}
window.addEventListener("florence:ready",start);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
