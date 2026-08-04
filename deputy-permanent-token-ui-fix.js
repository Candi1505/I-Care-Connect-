(()=>{
"use strict";
let running=false;
const bridge=()=>window.FlorenceBridge;
async function connectDirectly(event){
 const button=event.target instanceof Element?event.target.closest("#deputy-connect"):null;
 if(!button||running)return;
 event.preventDefault();
 event.stopImmediatePropagation();
 const b=bridge();
 if(!b?.db||!b.profile)return b?.toast?.("Florence is still loading your secure account");
 running=true;button.disabled=true;const original=button.textContent;button.textContent="Connecting…";
 try{
  const {data,error}=await b.db.functions.invoke("deputy-connect",{body:{action:"start"}});
  if(error){let message=data?.error||error.message||"Deputy connection failed";try{if(error.context instanceof Response){const payload=await error.context.clone().json();message=payload?.error||message}}catch{}throw new Error(message)}
  if(data?.error)throw new Error(data.error);
  b.toast?.("Deputy connected securely");
  setTimeout(()=>location.reload(),600);
 }catch(error){b.toast?.(error?.message||"Florence could not connect Deputy");button.disabled=false;button.textContent=original;running=false}
}
document.addEventListener("click",connectDirectly,true);
})();
