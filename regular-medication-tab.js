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
function loadRuntime(path,version){
 if([...document.scripts].some(script=>(script.getAttribute("src")||"").includes(path)))return;
 const script=document.createElement("script");
 script.src=`./${path}?v=${version}`;
 script.defer=true;
 script.dataset.florenceRuntime=path;
 document.head.appendChild(script);
}
function loadFlorenceModules(){
 loadRuntime("roster-30-day.js","20260812-mobile-regressions-1");
 loadRuntime("deputy-integration.js","20260804-3");
 loadRuntime("deputy-permanent-token-ui-fix.js","20260804-1");
 loadRuntime("invoicing-workspace.js","20260804-pricing-1");
 loadRuntime("invoice-menu-fix.js","20260804-pricing-1");
}
addRegularTab();
loadFlorenceModules();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{addRegularTab();loadFlorenceModules()},{once:true});
})();
