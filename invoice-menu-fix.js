(()=>{
"use strict";
let observer=null;
function loadWorkspace(){
 if([...document.scripts].some(s=>(s.getAttribute("src")||"").includes("invoicing-workspace.js")))return;
 const script=document.createElement("script");
 script.src="./invoicing-workspace.js?v=20260804-4";
 script.defer=true;
 script.dataset.florenceRuntime="invoicing-workspace.js";
 document.head.appendChild(script);
}
function apply(){
 const button=document.querySelector('[data-view="finance"]');
 if(button)button.textContent="💳 NDIS invoicing";
 const view=document.querySelector("#finance-view");
 if(view){
  const heading=view.querySelector("h2");
  if(heading&&/xero/i.test(heading.textContent||""))heading.textContent="NDIS invoicing";
  const intro=view.querySelector(".page-head p:not(.eyebrow)");
  if(intro&&/xero/i.test(intro.textContent||""))intro.textContent="Create, review, print and email NDIS invoices from Florence.";
  view.querySelectorAll(".xero-card,#connect-xero,#disconnect-xero").forEach(el=>el.remove());
 }
 loadWorkspace();
}
function start(){
 apply();
 if(observer)observer.disconnect();
 observer=new MutationObserver(()=>apply());
 observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
 setTimeout(()=>observer?.disconnect(),30000);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("pageshow",start);
document.addEventListener("click",event=>{if(event.target.closest?.('[data-view="finance"]'))setTimeout(apply,0)});
})();
