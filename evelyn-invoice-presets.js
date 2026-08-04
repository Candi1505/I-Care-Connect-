(()=>{
"use strict";
const PRESETS=[
 {name:"Evelyn SIL – Weekday daytime",shift:"24-hour support",day:"Weekday",code:"01_801_0138_1_1",item:"Supported Independent Living - Standard - Weekday Daytime",unit:"Hour",price:74},
 {name:"Evelyn SIL – Weekday evening",shift:"24-hour support",day:"Weekday",code:"01_802_0138_1_1",item:"Supported Independent Living - Standard - Weekday Evening",unit:"Hour",price:81},
 {name:"Evelyn SIL – Weekday night",shift:"24-hour support",day:"Weekday",code:"01_803_0138_1_1",item:"Supported Independent Living - Standard - Weekday Night",unit:"Hour",price:83},
 {name:"Evelyn SIL – Saturday",shift:"24-hour support",day:"Saturday",code:"01_804_0138_1_1",item:"Supported Independent Living - Standard - Saturday",unit:"Hour",price:104},
 {name:"Evelyn SIL – Sunday",shift:"24-hour support",day:"Sunday",code:"01_805_0138_1_1",item:"Supported Independent Living - Standard - Sunday",unit:"Hour",price:134},
 {name:"Evelyn SIL – Public holiday",shift:"24-hour support",day:"",code:"01_806_0138_1_1",item:"Supported Independent Living - Standard - Public Holiday",unit:"Hour",price:163},
 {name:"Evelyn SIL – Night-time sleepover",shift:"Sleepover",day:"",code:"01_832_0138_1_1",item:"Supported Independent Living - Night-Time Sleepover",unit:"Each",price:312},
 {name:"Evelyn – Community access weekday",shift:"Community access",day:"Weekday",code:"04_104_0125_6_1",item:"Access Community Social and Rec Activ - Standard - Weekday Daytime",unit:"Hour",price:73}
];
const q=(s,r=document)=>r.querySelector(s);
function toast(message){window.FlorenceBridge?.toast?.(message)}
function fill(preset){
 q("#smart-template-new")?.click();
 const apply=()=>{
  const fields={"#template-name":preset.name,"#template-shift-type":preset.shift,"#template-day":preset.day,"#template-code":preset.code,"#template-item-name":preset.item,"#template-unit":preset.unit,"#template-price":String(preset.price),"#template-claim":"Standard","#template-effective":"2026-07-01"};
  if(!q("#template-name"))return false;
  for(const [selector,value] of Object.entries(fields)){const el=q(selector);if(el){el.value=value;el.dispatchEvent(new Event("change",{bubbles:true}))}}
  q("#smart-template-panel")?.scrollIntoView({behavior:"smooth",block:"start"});
  toast(`${preset.name} filled in — review and tap Save template`);
  return true;
 };
 if(!apply()){let tries=0;const timer=setInterval(()=>{tries++;if(apply()||tries>20)clearInterval(timer)},100)}
}
function install(){
 const bridge=window.FlorenceBridge;if(!bridge?.profile||bridge.profile.role!=="supervisor")return false;
 const view=q("#finance-view");if(!view||q("#evelyn-invoice-presets"))return Boolean(q("#evelyn-invoice-presets"));
 const anchor=q("#smart-invoice-summary",view)||q(".panel",view);
 if(!anchor)return false;
 const panel=document.createElement("article");panel.id="evelyn-invoice-presets";panel.className="panel";
 panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Evelyn Tait</p><h3>Agreed invoice codes</h3><p>Choose a service from Evelyn's agreement to fill the reusable template form automatically.</p></div><span class="badge good">8 saved options</span></div><div class="actions" data-evelyn-presets>${PRESETS.map((p,i)=>`<button type="button" class="secondary" data-evelyn-preset="${i}">${p.name}<br><small>${p.code} · ${p.unit==="Each"?`$${p.price} each`:`$${p.price}/hr`}</small></button>`).join("")}</div><p class="record-meta">Rates are editable before saving. Confirm any future price changes against Evelyn's signed service agreement.</p>`;
 anchor.insertAdjacentElement("afterend",panel);
 panel.addEventListener("click",event=>{const button=event.target.closest("[data-evelyn-preset]");if(button)fill(PRESETS[Number(button.dataset.evelynPreset)])});
 return true;
}
function start(){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>160)clearInterval(timer)},250)}
window.addEventListener("florence:ready",start);window.addEventListener("pageshow",start);document.addEventListener("click",event=>{if(event.target.closest?.('[data-view="finance"]'))setTimeout(start,100)});if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();
