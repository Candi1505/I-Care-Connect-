(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=(selector,root=document)=>root.querySelector(selector);
let loading=false;

function ensurePage(){
 const bridge=B();
 if(!bridge?.profile||bridge.profile.role!=="supervisor")return null;
 const drawer=q("#drawer"),main=q("#app main");
 if(!drawer||!main)return null;

 let menu=q('[data-view="deputy"]',drawer);
 if(!menu){
  menu=document.createElement("button");
  menu.type="button";
  menu.className="admin-only";
  menu.dataset.view="deputy";
  menu.innerHTML="🧑‍💼 Deputy integration";
  const finance=q('[data-view="finance"]',drawer);
  finance?.insertAdjacentElement("afterend",menu) || drawer.appendChild(menu);
  menu.onclick=()=>{bridge.showView("deputy");setTimeout(()=>void loadStatus(),50)};
 }

 let view=q("#deputy-view");
 if(!view){
  view=document.createElement("section");
  view.id="deputy-view";
  view.className="view";
  view.innerHTML=`
   <div class="page-head">
    <div><p class="eyebrow">Workforce integration</p><h2>Deputy</h2><p>Connect I-Care Connect’s Deputy account for secure worker, roster and timesheet syncing.</p></div>
   </div>
   <article id="deputy-integration-panel" class="panel admin-only">
    <div class="panel-head">
     <div><p class="eyebrow">Secure connection</p><h3>Deputy account</h3><p id="deputy-integration-message">Checking the secure Deputy connection…</p></div>
     <span id="deputy-integration-status" class="badge amber">Checking…</span>
    </div>
    <div id="deputy-integration-details" class="record-meta hidden"></div>
    <div class="actions">
     <button id="connect-deputy" type="button" class="primary">Connect Deputy</button>
     <button id="refresh-deputy-status" type="button" class="secondary">Refresh status</button>
    </div>
   </article>
   <article class="panel">
    <div class="panel-head"><div><p class="eyebrow">Integration plan</p><h3>What Deputy will manage</h3></div></div>
    <div class="grid two">
     <div class="notice"><strong>Deputy workforce records</strong><br>Worker matching, published rosters, shift responses, clock-in and approved timesheets.</div>
     <div class="notice"><strong>Florence care records</strong><br>Participant files, MAR, progress notes, incidents, care plans and clinical information remain only in Florence.</div>
    </div>
    <p class="record-meta">Connecting Deputy does not send participant diagnoses, medications, progress notes or care-plan content to Deputy.</p>
   </article>`;
  main.appendChild(view);
  q("#connect-deputy",view).onclick=()=>void startConnection();
  q("#refresh-deputy-status",view).onclick=()=>void loadStatus();
 }
 return view;
}

function setBusy(busy){
 loading=busy;
 const connect=q("#connect-deputy"),refresh=q("#refresh-deputy-status");
 if(connect)connect.disabled=busy;
 if(refresh)refresh.disabled=busy;
}

async function invoke(action){
 const bridge=B();
 if(!bridge?.db||!bridge.profile)throw new Error("Florence is still loading your secure account");
 const {data,error}=await bridge.db.functions.invoke("deputy-connect",{body:{action}});
 if(error){
  let message=data?.error||error.message||"Deputy connection is unavailable";
  try{if(error.context instanceof Response){const payload=await error.context.clone().json();message=payload?.error||message}}catch(_ignored){}
  throw new Error(message);
 }
 if(data?.error)throw new Error(data.error);
 return data||{};
}

async function loadStatus(){
 if(loading)return;
 const view=ensurePage();if(!view)return;
 setBusy(true);
 const status=q("#deputy-integration-status",view),message=q("#deputy-integration-message",view),details=q("#deputy-integration-details",view),connect=q("#connect-deputy",view);
 try{
  const result=await invoke("status");
  if(result.connected&&result.connection){
   const item=result.connection;
   status.textContent="Connected";status.className="badge good";
   message.textContent="Florence is securely connected to Deputy.";
   const rows=[item.deputy_user_name?`Connected as ${item.deputy_user_name}`:null,item.deputy_endpoint?`Deputy site: ${item.deputy_endpoint}`:null,item.connected_at?`Connected ${B().fmt(item.connected_at)}`:null,item.last_synced_at?`Last sync ${B().fmt(item.last_synced_at)}`:"No workforce sync has run yet"].filter(Boolean);
   details.textContent=rows.join(" · ");details.classList.remove("hidden");
   connect.textContent="Reconnect Deputy";
  }else{
   status.textContent="Not connected";status.className="badge amber";
   message.textContent="Connect I-Care Connect’s Deputy account to prepare secure workforce syncing.";
   details.textContent="";details.classList.add("hidden");connect.textContent="Connect Deputy";
  }
 }catch(error){
  status.textContent="Needs attention";status.className="badge red";
  message.textContent=error.message||"Florence could not check Deputy.";
  details.classList.add("hidden");
 }finally{setBusy(false)}
}

async function startConnection(){
 if(loading)return;
 setBusy(true);
 try{
  const result=await invoke("start");
  if(!result.authorization_url)throw new Error("Deputy did not return a secure authorisation page");
  location.href=result.authorization_url;
 }catch(error){B()?.toast(error.message||"Florence could not start the Deputy connection");setBusy(false)}
}

function handleReturn(){
 const url=new URL(location.href),result=url.searchParams.get("deputy");
 if(!result)return;
 ensurePage();
 if(result==="connected"){
  B()?.toast("Deputy connected securely");
  B()?.showView("deputy");
  setTimeout(()=>void loadStatus(),80);
 }else B()?.toast("Deputy connection was not completed");
 url.searchParams.delete("deputy");url.searchParams.delete("reason");
 history.replaceState({},"",url.pathname+(url.search?url.search:"")+url.hash);
}

function install(){
 if(!ensurePage())return false;
 handleReturn();
 return true;
}
window.addEventListener("florence:ready",()=>{if(install())void loadStatus()});
window.addEventListener("pageshow",()=>setTimeout(()=>{if(install())void loadStatus()},50));
let attempts=0;const timer=setInterval(()=>{attempts++;if(install()||attempts>120)clearInterval(timer)},250);
})();