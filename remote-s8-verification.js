(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=s=>document.querySelector(s);
const isS8=m=>String(m?.medication_type||"").toLowerCase().replace(/[^a-z0-9]+/g,"")==="schedule8";
let pending=[];
function participantName(id){return B().state.participants.find(p=>p.id===id)?.preferred_name||B().state.participants.find(p=>p.id===id)?.full_name||"Participant"}
function medicationName(id){return B().state.medications.find(m=>m.id===id)?.medication_name||"Schedule 8 medication"}
async function load(){
 if(!B()?.profile||!B().isStaffUser())return;
 const {data,error}=await B().db.from("s8_remote_verifications").select("*").order("submitted_at",{ascending:false}).limit(50);
 if(error){console.warn("Remote S8 verification unavailable",error.message);return}
 pending=data||[];render();
}
function ensurePanel(){
 const view=q("#medications-view");if(!view)return null;
 let panel=q("#remote-s8-panel");
 if(!panel){panel=document.createElement("article");panel.id="remote-s8-panel";panel.className="panel staff-only";const tabs=view.querySelector(".segmented");tabs?.insertAdjacentElement("afterend",panel)}
 return panel;
}
function render(){
 const panel=ensurePanel();if(!panel)return;
 const supervisor=B().isSupervisor();
 const awaiting=pending.filter(x=>x.status==="Awaiting supervisor");
 const recent=pending.filter(x=>x.status!=="Awaiting supervisor").slice(0,8);
 panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Schedule 8 safety</p><h3>Remote supervisor verification</h3><p>The worker records the administration and stock balance with their own PIN. A supervisor then verifies it from their own device. This is recorded as remote verification, not an in-person witness.</p></div><button id="submit-remote-s8" type="button" class="primary">Record S8 for remote verification</button></div>
 ${supervisor?`<h4>Awaiting your review</h4><div class="stack">${awaiting.map(x=>`<article class="record"><div class="record-top"><div><h3>${B().esc(medicationName(x.medication_id))}</h3><p>${B().esc(participantName(x.participant_id))} · submitted ${B().fmt(x.submitted_at)}</p></div>${B().badge("Awaiting supervisor")}</div><p><strong>Quantity removed:</strong> ${B().esc(x.quantity)} · <strong>Balance:</strong> ${B().esc(x.balance)}</p>${x.worker_notes?`<p><strong>Worker notes:</strong> ${B().esc(x.worker_notes)}</p>`:""}<div class="actions"><button class="primary" data-verify-remote-s8="${x.id}">Review and sign</button></div></article>`).join("")||B().empty("No remote S8 entries are waiting.")}</div>`:""}
 ${recent.length?`<h4>Recent remote verifications</h4><div class="stack">${recent.map(x=>`<article class="record"><div class="record-top"><div><h3>${B().esc(medicationName(x.medication_id))}</h3><p>${B().esc(participantName(x.participant_id))} · ${B().fmt(x.submitted_at)}</p></div>${B().badge(x.status)}</div><p>Remote supervisor verification — not physically witnessed.</p></article>`).join("")}</div>`:""}`;
 q("#submit-remote-s8").onclick=openSubmit;
 panel.querySelectorAll("[data-verify-remote-s8]").forEach(btn=>btn.onclick=()=>openVerify(btn.dataset.verifyRemoteS8));
}
function openSubmit(){
 const meds=B().state.medications.filter(m=>m.active&&isS8(m));
 if(!meds.length)return B().toast("No active Schedule 8 medication profiles are available");
 B().form("Record S8 for remote supervisor verification",[
  B().field("medication_id","Schedule 8 medication","select",meds.map(m=>({value:m.id,label:`${m.medication_name} · ${participantName(m.participant_id)}`}))),
  B().field("quantity","Quantity removed from stock","number"),
  B().field("balance","Balance remaining","number"),
  B().field("notes","Administration and stock notes","textarea",[],false),
  B().field("pin","Your personal six-digit medication PIN","password")
 ],async values=>{
  if(!/^\d{6}$/.test(values.pin||""))throw new Error("Enter your six-digit PIN");
  const {error}=await B().db.rpc("submit_remote_s8_verification",{p_medication_id:values.medication_id,p_pin:values.pin,p_quantity:Number(values.quantity),p_balance:Number(values.balance),p_notes:values.notes||null});
  if(error)throw error;
  await load();return "S8 entry submitted to supervisors for remote verification";
 });
}
function openVerify(id){
 const item=pending.find(x=>x.id===id);if(!item)return;
 B().form("Remote supervisor verification",[
  `<article class="notice"><strong>Not an in-person witness</strong><br>Confirm the worker by phone or video, review the medication, quantity removed and remaining balance, then sign from your own Florence account.</article>`,
  `<div class="record"><p><strong>${B().esc(medicationName(item.medication_id))}</strong></p><p>${B().esc(participantName(item.participant_id))}</p><p>Quantity removed: ${B().esc(item.quantity)} · Balance: ${B().esc(item.balance)}</p>${item.worker_notes?`<p>Worker notes: ${B().esc(item.worker_notes)}</p>`:""}</div>`,
  B().field("method","Verification method","select",["Phone call","Video call"]),
  B().field("notes","Supervisor verification notes","textarea"),
  `<label><input name="discrepancy" type="checkbox" value="true"> A discrepancy was identified and follow-up is required</label>`,
  B().field("pin","Your personal six-digit medication PIN","password")
 ],async values=>{
  if(!/^\d{6}$/.test(values.pin||""))throw new Error("Enter your six-digit PIN");
  const {error}=await B().db.rpc("verify_remote_s8_entry",{p_verification_id:id,p_pin:values.pin,p_method:values.method,p_notes:values.notes,p_discrepancy:values.discrepancy==="true"});
  if(error)throw error;
  await B().refreshAll();await load();return values.discrepancy==="true"?"Remote verification recorded with a discrepancy":"Remote S8 verification completed";
 });
}
window.addEventListener("florence:ready",()=>void load());
document.addEventListener("click",event=>{if(event.target.closest('[data-view="medications"]'))setTimeout(()=>void load(),50)});
})();
