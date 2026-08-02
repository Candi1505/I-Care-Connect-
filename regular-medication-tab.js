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
addRegularTab();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",addRegularTab,{once:true});
})();
