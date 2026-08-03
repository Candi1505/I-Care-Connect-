(()=>{
"use strict";
function addRegularTab(){
 const group=document.querySelector("#medications-view .segmented");
 if(!group||group.querySelector('[data-med-tab="Regular"]'))return;
 const button=document.createElement("button");
 button.type="button";
 button.dataset.medTab="Regular";
 button.textContent="Regular";
 const prn=group.querySelector('[data-med-tab="PRN"]');
 group.insertBefore(button,prn||group.children[1]||null);
}
function loadRoster30Day(){
 if([...document.scripts].some(script=>(script.getAttribute("src")||"").includes("roster-30-day.js")))return;
 const script=document.createElement("script");
 script.src="./roster-30-day.js?v=20260804-1";
 script.defer=true;
 script.dataset.florenceRuntime="roster-30-day.js";
 document.head.appendChild(script);
}
addRegularTab();
loadRoster30Day();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{addRegularTab();loadRoster30Day()},{once:true});
})();
