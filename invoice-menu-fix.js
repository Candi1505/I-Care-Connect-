(()=>{
"use strict";
let attempts=0;
function loadWorkspace(){
 if([...document.scripts].some(script=>(script.getAttribute("src")||"").includes("invoicing-workspace.js")))return;
 const script=document.createElement("script");
 script.src="./invoicing-workspace.js?v=20260804-session-1";
 script.defer=true;
 script.dataset.florenceRuntime="invoicing-workspace.js";
 document.head.appendChild(script);
}
function apply(){
 const button=document.querySelector('[data-view="finance"]');
 if(button)button.textContent="💳 NDIS invoicing";
 const view=document.querySelector("#finance-view");
 if(view){
  view.querySelectorAll(".xero-card,#connect-xero,#disconnect-xero").forEach(element=>element.remove());
  const heading=view.querySelector("h2");
  if(heading)heading.textContent="NDIS invoicing";
  const intro=view.querySelector(".page-head p:not(.eyebrow)");
  if(intro)intro.textContent="Create, review, print and email NDIS invoices from Florence.";
 }
 loadWorkspace();
}
function start(){
 apply();
 attempts=0;
 const timer=setInterval(()=>{
  attempts+=1;
  apply();
  const ready=document.querySelector("#invoice-summary")||document.querySelector("#invoice-new");
  if(ready||attempts>=20)clearInterval(timer);
 },250);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("pageshow",start);
document.addEventListener("click",event=>{
 const target=event.target instanceof Element?event.target:null;
 if(target?.closest('[data-view="finance"]'))setTimeout(start,50);
});
})();
