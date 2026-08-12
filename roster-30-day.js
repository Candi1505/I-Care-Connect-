(()=>{
"use strict";
const B=()=>window.FlorenceBridge;
const q=(s,r=document)=>r.querySelector(s);
const qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const DAY_MS=86400000;
const VIEW_DAYS=30;
const MAX_SHIFTS=45;
let pageOffset=0;

function bridgeReady(){return Boolean(B()?.profile&&B()?.state)}
function isSupervisor(){return B()?.profile?.role==="supervisor"}
function brisbaneYmd(value=new Date()){return new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Brisbane",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value))}
function dayKey(date){return date.toISOString().slice(0,10)}
function clock(value){return new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Brisbane",hour:"numeric",minute:"2-digit"}).format(new Date(value))}
function shiftName(shift){return shift.participant?.full_name||B().state.participants.find(item=>item.id===shift.participant_id)?.full_name||"Participant"}
function workerName(shift){return shift.worker?.full_name||B().state.staff.find(item=>item.id===shift.assigned_staff_id)?.full_name||"Unassigned"}
function currentTab(){return q('[data-roster-tab].active')?.dataset.rosterTab||"published"}
function visibleShifts(){
 const tab=currentTab(),profile=B().profile;
 return B().state.shifts.filter(shift=>tab==="draft"?shift.status==="Draft":tab==="mine"?shift.assigned_staff_id===profile.id:shift.status==="Published");
}
function viewStart(){
 const today=new Date(`${brisbaneYmd()}T00:00:00Z`);
 today.setUTCDate(today.getUTCDate()+pageOffset*VIEW_DAYS);
 return today;
}
function shiftCell(shifts){
 if(!shifts.length)return '<span class="roster-empty-cell">—</span>';
 return shifts.sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).map(shift=>{
  const controls=[];
  const ownPendingShift=shift.status==="Published"&&shift.response==="Pending"&&shift.assigned_staff_id===B().profile.id;
  const ownAcceptedShift=shift.status==="Published"&&shift.response==="Accepted"&&shift.assigned_staff_id===B().profile.id;
  if(shift.status==="Draft")controls.push(`<button class="publish" data-publish="${shift.id}">Publish</button>`);
  if(ownPendingShift)controls.push(`<button class="accept" data-shift-response="${shift.id}" data-response="Accepted">Accept</button><button class="decline" data-shift-response="${shift.id}" data-response="Declined">Decline</button>`);
  if(ownAcceptedShift)controls.push(`<button class="accept" data-roster-clock-in="${shift.id}">Clock in</button><button class="secondary" data-roster-clock-out="${shift.id}">Clock out</button>`);
  if(shift.status==="Published")controls.push(`<button class="decline" data-cancel-shift="${shift.id}">Cancel</button>`);
  return `<article class="calendar-shift ${String(shift.status||"").toLowerCase()}"><strong>${esc(shiftName(shift))}</strong><span>${esc(clock(shift.starts_at))}–${esc(clock(shift.ends_at))}</span><small>${esc(shift.shift_type)} · ${esc(shift.response||shift.status)}</small>${shift.handover_notes?`<small class="calendar-note">${esc(shift.handover_notes)}</small>`:""}${controls.length?`<div class="calendar-actions">${controls.join("")}</div>`:""}</article>`;
 }).join("");
}
function render30DayRoster(){
 if(!bridgeReady()||!isSupervisor())return false;
 const host=q("#roster-list");if(!host)return false;
 const start=viewStart();
 const days=Array.from({length:VIEW_DAYS},(_,index)=>{const day=new Date(start);day.setUTCDate(start.getUTCDate()+index);return day});
 const end=days[VIEW_DAYS-1],keys=days.map(dayKey),shifts=visibleShifts().filter(shift=>keys.includes(brisbaneYmd(shift.starts_at)));
 const tab=currentTab();
 const workers=B().state.staff.filter(person=>person.active&&["staff","supervisor"].includes(person.role)&&(tab!=="mine"||person.id===B().profile.id));
 shifts.forEach(shift=>{if(shift.assigned_staff_id&&!workers.some(worker=>worker.id===shift.assigned_staff_id))workers.push({id:shift.assigned_staff_id,full_name:workerName(shift),role:"staff"})});
 workers.sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name)));
 const rows=[];if(shifts.some(shift=>!shift.assigned_staff_id))rows.push({id:null,full_name:"Open shifts",role:"Unassigned"});workers.forEach(worker=>rows.push(worker));
 const header=days.map(day=>`<th><span>${new Intl.DateTimeFormat("en-AU",{weekday:"short",timeZone:"UTC"}).format(day)}</span><strong>${new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",timeZone:"UTC"}).format(day)}</strong></th>`).join("");
 const body=rows.length?rows.map(worker=>`<tr><th class="roster-worker"><strong>${esc(worker.full_name)}</strong><small>${esc(worker.role==="supervisor"?"Supervisor":worker.role==="staff"?"Support worker":"Unassigned")}</small></th>${keys.map(key=>`<td>${shiftCell(shifts.filter(shift=>(shift.assigned_staff_id||null)===(worker.id||null)&&brisbaneYmd(shift.starts_at)===key))}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${VIEW_DAYS+1}"><div class="empty">No staff or shifts in this 30-day period.</div></td></tr>`;
 const range=new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"});
 host.innerHTML=`<div class="roster-calendar-toolbar"><button class="secondary" data-roster-30="-1" aria-label="Previous 30 days">‹</button><button class="secondary roster-today" data-roster-30="today">Today</button><div><p class="eyebrow">30-day roster</p><strong>${range.format(start)} – ${range.format(end)}</strong></div><button class="secondary" data-roster-30="1" aria-label="Next 30 days">›</button></div><div class="roster-calendar-scroll"><table class="roster-calendar" data-roster-days="30"><thead><tr><th class="roster-worker">Worker</th>${header}</tr></thead><tbody>${body}</tbody></table></div><p class="roster-calendar-hint">Swipe sideways to see all 30 days. Accept or decline pending shifts, then clock in and out from your accepted shift card.</p>`;
 return true;
}
function openShiftForm(){
 const bridge=B();if(!bridgeReady()||!isSupervisor())return;
 bridge.form("Create roster shifts",[
  bridge.field("participant_id","Participant","select",bridge.state.participants.map(participant=>({value:participant.id,label:participant.full_name}))),
  bridge.field("assigned_staff_id","Assigned worker (optional — leave blank to broadcast)","select",[{value:"",label:"Open shift — any worker can claim"},...bridge.state.staff.filter(person=>["staff","supervisor"].includes(person.role)).map(person=>({value:person.id,label:person.full_name}))],false),
  bridge.field("starts_at","First shift start","datetime-local"),bridge.field("ends_at","First shift finish","datetime-local"),
  bridge.field("shift_type","Shift type","select",["24-hour support","Personal care","Community access","Social support","Sleepover","Transport","Domestic assistance"]),
  `<label>Number of weekly shifts to create (1–45)<input name="shift_count" type="number" min="1" max="45" step="1" value="1" required><small>The same shift will repeat every 7 days.</small></label>`,
  bridge.field("status","Save as","select",["Draft","Published"]),bridge.field("instructions","Shift instructions (optional)","textarea",[],false),bridge.field("handover_notes","Handover information (optional)","textarea",[],false)
 ],async values=>{
  const starts=new Date(values.starts_at),ends=new Date(values.ends_at);
  if(!Number.isFinite(starts.getTime())||!Number.isFinite(ends.getTime())||ends<=starts)throw new Error("Shift finish must be after its start");
  const count=Number(values.shift_count);
  if(!Number.isInteger(count)||count<1||count>MAX_SHIFTS)throw new Error("Choose between 1 and 45 shifts");
  const group=count>1?(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`):null,rows=[];
  for(let index=0;index<count;index++){
   const shiftStart=new Date(starts.getTime()+index*7*DAY_MS),shiftEnd=new Date(ends.getTime()+index*7*DAY_MS);
   if(values.assigned_staff_id&&bridge.state.shifts.some(existing=>existing.assigned_staff_id===values.assigned_staff_id&&existing.status!=="Cancelled"&&new Date(existing.starts_at)<shiftEnd&&new Date(existing.ends_at)>shiftStart))throw new Error(`Roster conflict at shift ${index+1}: this worker already has an overlapping shift`);
   rows.push({organisation_id:bridge.profile.organisation_id,participant_id:values.participant_id,assigned_staff_id:values.assigned_staff_id||null,starts_at:shiftStart.toISOString(),ends_at:shiftEnd.toISOString(),shift_type:values.shift_type,status:values.status,response:values.status==="Published"?"Pending":"Not sent",instructions:values.instructions||null,handover_notes:values.handover_notes||null,recurrence_group:group,created_by:bridge.profile.id,published_at:values.status==="Published"?new Date().toISOString():null});
  }
  const {error}=await bridge.db.from("shifts").insert(rows);if(error)throw error;
  await bridge.refreshAll();setTimeout(render30DayRoster,60);
  return count>1?`${count} weekly shifts created`:values.status==="Published"?"Shift published":"Draft saved";
 });
}
function install(){
 if(!bridgeReady()||!isSupervisor())return false;
 const add=q("#add-shift");if(add&&!add.dataset.roster30Bound){add.dataset.roster30Bound="true";add.onclick=openShiftForm}
 const host=q("#roster-list");
 if(host&&!host.__roster30Observer){
  const observer=new MutationObserver(()=>{if(q("#roster-view.active")&&!q('[data-roster-days="30"]',host))queueMicrotask(render30DayRoster)});
  observer.observe(host,{childList:true});host.__roster30Observer=observer;
 }
 render30DayRoster();return true;
}
document.addEventListener("click",event=>{
 const nav=event.target.closest("[data-roster-30]");if(nav){event.preventDefault();pageOffset=nav.dataset.roster30==="today"?0:pageOffset+Number(nav.dataset.roster30);render30DayRoster();return}
 if(event.target.closest("[data-roster-tab],[data-view=\"roster\"]"))setTimeout(render30DayRoster,80);
});
window.addEventListener("florence:ready",install);window.addEventListener("pageshow",install);
let attempts=0;const timer=setInterval(()=>{attempts++;if(install()||attempts>120)clearInterval(timer)},250);
})();
