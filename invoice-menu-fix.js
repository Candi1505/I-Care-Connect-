(()=>{
"use strict";
function apply(){
 const button=document.querySelector('[data-view="finance"]');
 if(button)button.textContent="💳 NDIS invoicing";
}
apply();
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply,{once:true});
window.addEventListener("pageshow",apply);
})();
