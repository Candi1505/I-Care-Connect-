(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=(selector,root=document)=>root.querySelector(selector);
let loading=false;

function ensurePanel(){
 const bridge=B();
 if(!bridge?.profile||bridge.profile.role!=="supervisor")return null;
 const host=q("#my-account-view")||q("#finance-view")||q("#dashboard-view");
 if(!host)return null;
 let panel=q("#deputy-integration-panel");
 if(panel)return panel;
 panel=document.createElement("article");
 panel.id="deputy-integration-panel";
 panel.className="panel admin-only";
 panel.innerHTML=`
  <div class="panel-head">
   <div><p class="eyebrow">Workforce integration</p><h3>Deputy</h3><p id="deputy-integration-message">Checking the secure Deputy connection…</p></div>
   <span id="deputy-integration-status" class="badge amber">Checking…</span>
  </div>
  <div id="deputy-integration-details" class="record-meta hidden"></div>
  <div class="actions">
   <button id="connect-deputy" type="button" class="primary">Connect Deputy</button>
   <button id="refresh-deputy-status" type="button" class="secondary">Refresh status</button>
  </div>
  <p class="record-meta">Florence will use Deputy for workforce scheduling and timesheet exchange. Participant care records, MAR, progress notes and clinical information remain in Florence.</p>`;
 const heading=host.querySelector(".page-head");
 heading?.insertAdjacentElement("afterend",panel) || host.prepend(panel);
 q("#connect-deputy",panel).onclick=()=>void startConnection();
 q("#refresh-deputy-status",panel).onclick=()=>void loadStatus();
 return panel;
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
 const panel=ensurePanel();if(!panel)return;
 setBusy(true);
 const status=q("#deputy-integration-status",panel),message=q("#deputy-integration-message",panel),details=q("#deputy-integration-details",panel),connect=q("#connect-deputy",panel);
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
   message.textContent="Connect I-Care Connect’s Deputy account to prepare secure worker, roster and timesheet syncing.";
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
 if(result==="connected")B()?.toast("Deputy connected securely");
 else B()?.toast("Deputy connection was not completed");
 url.searchParams.delete("deputy");url.searchParams.delete("reason");
 history.replaceState({},"",url.pathname+(url.search?url.search:"")+url.hash);
}

function install(){
 if(!ensurePanel())return false;
 handleReturn();void loadStatus();return true;
}
window.addEventListener("florence:ready",install);
window.addEventListener("pageshow",()=>setTimeout(install,50));
document.addEventListener("click",event=>{if(event.target.closest('[data-view="my-account"],[data-view="finance"]'))setTimeout(install,50)});
let attempts=0;const timer=setInterval(()=>{attempts++;if(install()||attempts>80)clearInterval(timer)},250);
})();
