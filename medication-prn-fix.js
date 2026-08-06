(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=s=>document.querySelector(s);
function bind(){
 const bridge=B(),button=q("#add-med");
 if(!bridge?.profile||!button||button.dataset.prnFixBound)return false;
 button.dataset.prnFixBound="true";
 button.onclick=()=>bridge.form("Add medication profile",[
  bridge.field("participant_id","Participant","select",bridge.state.participants.map(p=>({value:p.id,label:p.full_name}))),
  bridge.field("medication_name","Medication name"),
  bridge.field("dose","Dose"),
  bridge.field("route","Route","select",["Oral","Topical","Inhaled","Subcutaneous","Other"]),
  bridge.field("medication_type","Type","select",["Regular","PRN","Schedule 8"]),
  bridge.field("administration_time","Administration time (leave blank for PRN)","time",[],false),
  bridge.field("prn_indication","PRN indication (required for PRN)","textarea",[],false),
  bridge.field("max_prn_dose","Maximum PRN dose (required for PRN)","text",[],false),
  bridge.field("hold_from","Hold from (optional)","date",[],false),
  bridge.field("hold_until","Hold until (optional)","date",[],false),
  bridge.field("ceased_at","Ceased date (optional)","date",[],false),
  bridge.field("instructions","Administration instructions (optional)","textarea",[],false)
 ],async values=>{
  const type=String(values.medication_type||"").trim();
  if(!["Regular","PRN","Schedule 8"].includes(type))throw new Error("Choose Regular, PRN or Schedule 8");
  if(type==="PRN"){
   values.administration_time="";
   if(!String(values.prn_indication||"").trim())throw new Error("Enter the reason or indication for this PRN medication");
   if(!String(values.max_prn_dose||"").trim())throw new Error("Enter the maximum PRN dose");
  }else{
   values.prn_indication="";
   values.max_prn_dose="";
  }
  const payload={organisation_id:bridge.profile.organisation_id,active:!values.ceased_at,created_by:bridge.profile.id,...values,medication_type:type};
  for(const key of ["administration_time","prn_indication","max_prn_dose","hold_from","hold_until","ceased_at","instructions"]){if(!payload[key])payload[key]=null}
  const {data,error}=await bridge.db.from("medications").insert(payload).select("id,medication_type").single();
  if(error)throw error;
  if(data.medication_type!==type)throw new Error("Florence could not save the selected medication type");
  location.reload();
  return `${type} medication added`;
 });
 return true;
}
window.addEventListener("florence:ready",bind);
let attempts=0;const timer=setInterval(()=>{attempts++;if(bind()||attempts>30)clearInterval(timer)},300);
})();

(()=>{
"use strict";
const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)],B=()=>window.FlorenceBridge;
const painWords=[
 {value:"0",face:"🙂",label:"No pain",range:"0"},
 {value:"2",face:"😐",label:"A little pain",range:"1–3"},
 {value:"5",face:"😟",label:"Medium pain",range:"4–6"},
 {value:"8",face:"😣",label:"A lot of pain",range:"7–9"},
 {value:"10",face:"😭",label:"Worst pain",range:"10"}
];
let currentMedication=null,appendedAssessment="";
function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
function showError(message){const status=q("#pin-status");if(status){status.textContent=message;status.classList.remove("hidden")}else toast(message)}
function activeMedication(){const summary=String(q("#pin-summary")?.textContent||"").trim(),meds=B()?.state?.medications||[];return meds.find(m=>summary.startsWith(`${m.medication_name} · ${m.dose}`))||meds.find(m=>summary.includes(m.medication_name))||null}
function isPrn(med){return String(med?.medication_type||"").trim().toLowerCase()==="prn"}
function ensurePanel(){
 const form=q("#pin-form");if(!form)return null;let panel=q("#prn-pain-assessment",form);if(panel)return panel;
 panel=document.createElement("section");panel.id="prn-pain-assessment";panel.className="notice hidden";
 panel.innerHTML=`<div class="prn-pain-head"><div><strong>Easy-read pain assessment</strong><p>Use the participant’s own report wherever possible. Add observations if communication is limited.</p></div><span class="badge amber">PRN</span></div>
 <label>Is this PRN being given for pain?<select id="prn-for-pain"><option value="">Choose</option><option value="No">No</option><option value="Yes">Yes</option></select></label>
 <div id="prn-pain-fields" class="hidden"><fieldset class="prn-face-fieldset"><legend>Ask: “Show me how much it hurts”</legend><div class="prn-face-scale">${painWords.map(item=>`<button type="button" class="prn-face-choice" data-pain-face="${item.value}" aria-pressed="false"><span class="prn-face">${item.face}</span><strong>${item.label}</strong><small>${item.range}</small></button>`).join("")}</div><input id="prn-pain-face-value" type="hidden"></fieldset>
 <label>Number, if the participant can use it (optional)<select id="prn-pain-number"><option value="">Not used</option>${Array.from({length:11},(_,i)=>`<option value="${i}">${i}</option>`).join("")}</select></label>
 <label>Where does it hurt?<input id="prn-pain-location" type="text" placeholder="For example: left knee, stomach, head"></label>
 <label>How was the pain communicated?<select id="prn-pain-communication"><option value="">Choose</option><option>Participant pointed or showed location</option><option>Participant used words</option><option>Participant selected a face</option><option>Participant selected a number</option><option>Staff observation with participant confirmation</option><option>Staff observation only</option></select></label>
 <fieldset><legend>Observed signs — select all that apply</legend><div class="prn-observation-grid">${["Facial expression changed","Guarding or touching area","Vocalising, crying or groaning","Reduced movement or mobility","Restlessness or agitation","Withdrawal or unusually quiet","Change from usual behaviour","Sleep or appetite change","No clear observable signs"].map(label=>`<label><input type="checkbox" name="prn-pain-sign" value="${label}"> ${label}</label>`).join("")}</div></fieldset>
 <label>Additional pain information (optional)<textarea id="prn-pain-extra" placeholder="What is different from usual, possible cause, what helped before"></textarea></label></div>`;
 const notes=q("#mar-notes")?.closest("label");notes?notes.insertAdjacentElement("beforebegin",panel):form.querySelector(".dialog-actions")?.insertAdjacentElement("beforebegin",panel);
 q("#prn-for-pain",panel).addEventListener("change",event=>q("#prn-pain-fields",panel).classList.toggle("hidden",event.target.value!=="Yes"));
 qa("[data-pain-face]",panel).forEach(button=>button.addEventListener("click",()=>{qa("[data-pain-face]",panel).forEach(item=>{item.classList.toggle("selected",item===button);item.setAttribute("aria-pressed",String(item===button))});q("#prn-pain-face-value",panel).value=button.dataset.painFace}));return panel;
}
function resetPanel(panel){q("#prn-for-pain",panel).value="";q("#prn-pain-fields",panel).classList.add("hidden");q("#prn-pain-face-value",panel).value="";q("#prn-pain-number",panel).value="";q("#prn-pain-location",panel).value="";q("#prn-pain-communication",panel).value="";q("#prn-pain-extra",panel).value="";qa('input[name="prn-pain-sign"]',panel).forEach(input=>input.checked=false);qa("[data-pain-face]",panel).forEach(button=>{button.classList.remove("selected");button.setAttribute("aria-pressed","false")});appendedAssessment="";const notes=q("#mar-notes");if(notes)delete notes.dataset.prnAssessment}
function showForMedication(med){const panel=ensurePanel();if(!panel)return;if(!isPrn(med)){panel.classList.add("hidden");currentMedication=null;return}if(currentMedication?.id!==med.id)resetPanel(panel);currentMedication=med;panel.classList.remove("hidden")}
function showForCurrentMedication(){showForMedication(activeMedication())}
function replaceAssessment(notes,assessment){let base=notes.value.trim();const previous=notes.dataset.prnAssessment||appendedAssessment;if(previous&&base.endsWith(previous))base=base.slice(0,-previous.length).replace(/\s+—\s+$/,"").trim();notes.dataset.prnAssessment=assessment;appendedAssessment=assessment;notes.value=[base,assessment].filter(Boolean).join(" — ")}
function appendAssessment(){
 const panel=q("#prn-pain-assessment");if(!panel||panel.classList.contains("hidden")||!isPrn(currentMedication))return;
 const forPain=q("#prn-for-pain",panel).value;if(!forPain)throw new Error("Choose whether this PRN is being given for pain");const notes=q("#mar-notes");if(forPain==="No"){replaceAssessment(notes,"PRN assessment: Not given for pain");return}
 const face=q("#prn-pain-face-value",panel).value,location=q("#prn-pain-location",panel).value.trim(),communication=q("#prn-pain-communication",panel).value;
 if(!face)throw new Error("Ask the participant to choose the face or words that best show the pain");if(!location)throw new Error("Record where the pain is located");if(!communication)throw new Error("Record how the pain was communicated or observed");
 const faceItem=painWords.find(item=>item.value===face),number=q("#prn-pain-number",panel).value,signs=qa('input[name="prn-pain-sign"]:checked',panel).map(input=>input.value),extra=q("#prn-pain-extra",panel).value.trim();
 const assessment=[`PRN pain assessment: ${faceItem?.label||face} (${faceItem?.range||face})`,number?`Participant number rating: ${number}/10`:null,`Pain location: ${location}`,`Communication: ${communication}`,`Observed signs: ${signs.length?signs.join(", "):"None selected"}`,extra?`Additional pain information: ${extra}`:null].filter(Boolean).join(" | ");
 replaceAssessment(notes,assessment);
}
function install(){const form=q("#pin-form");if(!form||form.__prnPainInstalled)return;form.__prnPainInstalled=true;ensurePanel();form.addEventListener("submit",event=>{try{appendAssessment()}catch(error){event.preventDefault();event.stopImmediatePropagation();showError(error.message)}},{capture:true});window.addEventListener("florence:medication-sign-open",event=>{const medId=event.detail?.medicationId,med=(B()?.state?.medications||[]).find(item=>item.id===medId);showForMedication(med||activeMedication())});document.addEventListener("click",event=>{if(event.target.closest("[data-administer],[data-mar-sign]"))setTimeout(showForCurrentMedication,40)})}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();window.addEventListener("florence:ready",install);window.addEventListener("pageshow",install);
const style=document.createElement("style");style.textContent=`#prn-pain-assessment{margin:14px 0}.prn-pain-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.prn-pain-head p{margin:.3rem 0 0}.prn-face-fieldset{margin-top:12px}.prn-face-scale{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.prn-face-choice{display:flex;min-width:0;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:10px 4px;border:2px solid rgba(95,143,114,.25);border-radius:14px;background:#fff;color:#244f38}.prn-face-choice.selected{border-color:#3f7655;background:#eaf5ed;box-shadow:0 0 0 2px rgba(63,118,85,.12)}.prn-face{font-size:1.8rem}.prn-face-choice strong{font-size:.72rem;line-height:1.15;text-align:center}.prn-face-choice small{font-size:.7rem}.prn-observation-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-top:8px}.prn-observation-grid label{display:flex;gap:7px;align-items:flex-start;font-size:.9rem}@media(max-width:520px){.prn-face-scale{grid-template-columns:repeat(3,1fr)}.prn-observation-grid{grid-template-columns:1fr}}`;document.head.appendChild(style);
})();
