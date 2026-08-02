(()=>{
"use strict";
const q=s=>document.querySelector(s);
const B=()=>window.FlorenceBridge;
const REFRESH_KEY="florence-live-directory-signature";
let checking=false;
let intervalId=null;

function toast(message){
 const bridge=B();
 if(bridge?.toast)return bridge.toast(message);
 const el=q("#toast");
 if(!el)return;
 el.textContent=message;
 el.classList.add("show");
 setTimeout(()=>el.classList.remove("show"),2800);
}

function staffViewOpen(){
 return q("#staff-management-view")?.classList.contains("active");
}

function signature(staff=[]){
 return staff.map(person=>[
  person.id,
  person.role,
  person.active,
  person.participant_id||"",
  person.created_at||"",
  person.last_sign_in_at||"",
  person.banned_until||""
 ].join(":"))
 .sort()
 .join("|");
}

async function refreshFlorence({announce=true}={}){
 const button=q("#refresh-florence");
 if(button){button.disabled=true;button.setAttribute("aria-busy","true");}
 if(announce)toast("Refreshing Florence…");
 try{
  if("serviceWorker" in navigator){
   const registrations=await navigator.serviceWorker.getRegistrations();
   await Promise.all(registrations.map(registration=>registration.update().catch(()=>null)));
  }
  if("caches" in window){
   const keys=await caches.keys();
   await Promise.all(keys.filter(key=>key.startsWith("florence-")).map(key=>caches.delete(key)));
  }
  await fetch(`./config.js?refresh=${Date.now()}`,{cache:"no-store"}).catch(()=>null);
 }finally{
  const url=new URL(location.href);
  url.searchParams.set("florence_refresh",Date.now().toString());
  location.replace(url.toString());
 }
}

function ensureRefreshButton(){
 const topbar=q(".topbar");
 if(!topbar||q("#refresh-florence"))return;
 const button=document.createElement("button");
 button.id="refresh-florence";
 button.type="button";
 button.className="icon-btn";
 button.title="Refresh Florence";
 button.setAttribute("aria-label","Refresh Florence");
 button.textContent="↻";
 const bell=q("#bell");
 if(bell)topbar.insertBefore(button,bell);
 else topbar.appendChild(button);
 button.addEventListener("click",()=>void refreshFlorence());
}

async function checkDirectory(){
 if(checking||!staffViewOpen())return;
 const bridge=B();
 if(!bridge?.db||!bridge?.profile||!bridge.isSupervisor?.())return;
 checking=true;
 try{
  const {data,error}=await bridge.db.functions.invoke("staff-management",{body:{action:"list"}});
  if(error||data?.error)return;
  const next=signature(data?.staff||[]);
  const previous=sessionStorage.getItem(REFRESH_KEY);
  if(!previous){
   sessionStorage.setItem(REFRESH_KEY,next);
   return;
  }
  if(next!==previous){
   sessionStorage.setItem(REFRESH_KEY,next);
   toast("People and invitations changed — refreshing Florence");
   setTimeout(()=>void refreshFlorence({announce:false}),650);
  }
 }catch(_error){
  // The normal staff-management screen shows connection errors; keep this watcher quiet.
 }finally{
  checking=false;
 }
}

function startWatcher(){
 ensureRefreshButton();
 if(intervalId)return;
 intervalId=setInterval(()=>void checkDirectory(),5000);
 document.addEventListener("visibilitychange",()=>{
  if(!document.hidden)void checkDirectory();
 });
 window.addEventListener("focus",()=>void checkDirectory());
 document.addEventListener("click",event=>{
  const target=event.target instanceof Element?event.target:null;
  if(target?.closest('[data-view="staff-management"]'))setTimeout(()=>void checkDirectory(),300);
 });
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",startWatcher,{once:true});
else startWatcher();
window.addEventListener("florence:ready",startWatcher);
window.FlorenceRefresh=refreshFlorence;
})();
