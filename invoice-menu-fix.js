(()=>{
"use strict";
const WORKSPACE="./invoicing-workspace.js?v=20260804-10";
const LOGIN_RECOVERY="./login-recovery.js?v=20260804-1";
let attempts=0;
function ensureLoginRecovery(){
 if([...document.scripts].some(script=>(script.getAttribute("src")||"").includes("login-recovery.js")))return;
 const script=document.createElement("script");script.src=LOGIN_RECOVERY;script.async=false;document.head.appendChild(script);
}
function workspaceReady(){return Boolean(document.querySelector("#smart-invoice-new")&&document.querySelector("#smart-template-new"));}
function loadWorkspace(force=false){
 if(workspaceReady())return;
 const loaded=[...document.scripts].some(script=>(script.getAttribute("src")||"").includes("invoicing-workspace.js?v=20260804-10"));
 if(loaded&&!force)return;
 const script=document.createElement("script");
 script.src=force?`${WORKSPACE}&retry=${Date.now()}`:WORKSPACE;
 script.async=false;
 script.dataset.florenceRuntime="invoicing-workspace.js";
 script.onload=()=>window.dispatchEvent(new CustomEvent("florence:ready"));
 document.head.appendChild(script);
}
function apply(){
 ensureLoginRecovery();
 const button=document.querySelector('[data-view="finance"]');
 if(button)button.textContent="💳 NDIS invoicing";
 const view=document.querySelector("#finance-view");
 if(view){
  view.querySelectorAll(".xero-card,#connect-xero,#disconnect-xero").forEach(element=>element.remove());
  const heading=view.querySelector("h2");if(heading)heading.textContent="NDIS invoicing";
  const intro=view.querySelector(".page-head p:not(.eyebrow)");if(intro)intro.textContent="Create, review, print and email NDIS invoices from Florence.";
 }
 if(!workspaceReady())loadWorkspace(attempts===8||attempts===20);
}
function start(){
 attempts=0;apply();
 const timer=setInterval(()=>{
  attempts+=1;apply();
  if(workspaceReady()||attempts>=40)clearInterval(timer);
 },250);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("pageshow",start);
window.addEventListener("florence:ready",()=>setTimeout(start,0));
document.addEventListener("click",event=>{const target=event.target instanceof Element?event.target:null;if(target?.closest('[data-view="finance"]'))setTimeout(start,50)});
})();
