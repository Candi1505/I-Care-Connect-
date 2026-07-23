(() => {
"use strict";
const C=window.FLORENCE_CONFIG||{},KEY="florence10", $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const id=()=>crypto.randomUUID?.()||Date.now()+"-"+Math.random().toString(16).slice(2);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const iso=()=>new Date().toISOString();
const fmt=v=>new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(v));
const date=v=>new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(v));
let role="supervisor", rosterTab="published", medTab="round", complianceTab="all", pending=null, pendingMed=null;

const seed={
 profile:{name:"Candice Long",role:"Senior Support Worker",medicationPin:"654321"},
 staff:[
  {id:id(),name:"Candice Long",role:"Senior Support Worker",email:"candice@icareconnect.com.au"},
  {id:id(),name:"Victoria Kussrow",role:"Supervisor",email:"vj@icareconnect.com.au"},
  {id:id(),name:"Amanda Buchanan",role:"Support Worker",email:"amanda@icareconnect.com.au"}
 ],
 participants:[{
  id:id(),name:"Evelyn Tait",preferredName:"Evie",dob:"1956-07-09",ndisNumber:"",address:"Stanthorpe, Queensland",
  phone:"",emergencyContact:"Victoria Kussrow",guardian:"",gp:"",pharmacy:"",communication:"Clear, calm language and familiar routines.",
  diagnoses:"Intellectual Developmental Disorder; Autism Spectrum Disorder – Level 2",allergies:"No allergies recorded",
  goals:"Maintain independence, safety, community participation and quality of life.",
  preferences:"Values routine, predictability, familiar staff, choice and control. Enjoys cross stitch, shopping, DVDs, knitting, crocheting, puzzles and making earrings.",
  risks:"Unexpected changes and unfamiliar people may increase anxiety.",fundingStart:"",fundingEnd:"",status:"Active",documents:[]
 }],
 shifts:[
  {id:id(),participant:"Evelyn Tait",worker:"Candice Long",start:new Date(new Date().setHours(8,0,0,0)).toISOString(),end:new Date(Date.now()+86400000).toISOString(),type:"24-hour support",status:"Published",response:"Pending",notes:""},
  {id:id(),participant:"Evelyn Tait",worker:"Amanda Buchanan",start:new Date(Date.now()+172800000).toISOString(),end:new Date(Date.now()+183600000).toISOString(),type:"Social support",status:"Draft",response:"Not sent",notes:""}
 ],
 medications:[{id:id(),participant:"Evelyn Tait",name:"Example regular medication",dose:"1 tablet",route:"Oral",time:"08:00",type:"Regular",instructions:"Administer according to the current pharmacy label and medication chart.",active:true}],
 mar:[],
 notes:[],
 compliance:[
  {id:id(),scope:"Organisation",subject:"I-Care Connect",category:"Policy and procedure",title:"Medication Management Policy",fileName:"Medication-Management-Policy.pdf",mime:"application/pdf",uploadedAt:iso(),uploadedBy:"Candice Long",reviewDate:"2027-05-04",status:"Current",dataUrl:""},
  {id:id(),scope:"Participant",subject:"Evelyn Tait",category:"Service agreement",title:"Participant Service Agreement",fileName:"Service-Agreement.pdf",mime:"application/pdf",uploadedAt:iso(),uploadedBy:"Candice Long",reviewDate:"2026-09-01",status:"Current",dataUrl:""},
  {id:id(),scope:"Staff",subject:"Candice Long",category:"NDIS Worker Screening",title:"Worker Screening Clearance",fileName:"Worker-Screening.pdf",mime:"application/pdf",uploadedAt:iso(),uploadedBy:"Candice Long",reviewDate:"2026-08-15",status:"Current",dataUrl:""}
 ],
 invoices:[]
};
let data=load();
function load(){try{return JSON.parse(localStorage.getItem(KEY))||structuredClone(seed)}catch{return structuredClone(seed)}}
function save(){localStorage.setItem(KEY,JSON.stringify(data));render()}
function toast(t){let e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2200)}
function initials(n){return n.split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase()}
function showView(v){$$(".view").forEach(e=>e.classList.toggle("active",e.id===v+"-view"));$$("[data-view]").forEach(e=>e.classList.toggle("active",e.dataset.view===v));closeDrawer();scrollTo({top:0,behavior:"smooth"})}
function openDrawer(){$("#drawer").classList.add("open");$("#scrim").classList.remove("hidden")}
function closeDrawer(){$("#drawer").classList.remove("open");$("#scrim").classList.add("hidden")}
function expStatus(d){if(!d)return "No review date";let days=Math.ceil((new Date(d)-new Date())/86400000);return days<0?"Expired":days<=30?"Due soon":"Current"}
function badge(s){let c=/expired|declined|overdue/i.test(s)?"red":/due|pending|draft|withheld/i.test(s)?"amber":/schedule 8/i.test(s)?"purple":"good";return `<span class="badge ${c}">${esc(s)}</span>`}
function empty(t){return `<div class="empty">${esc(t)}</div>`}
function render(){
 $(".admin-only")?.classList.toggle("hidden",role!=="supervisor");$$(".admin-only").forEach(e=>e.classList.toggle("hidden",role!=="supervisor"));
 renderDashboard();renderParticipants();renderRoster();renderMeds();renderNotes();renderCompliance();renderFinance()
}
function renderDashboard(){
 let pendingShifts=data.shifts.filter(s=>s.status==="Published"&&s.response==="Pending");
 let alerts=data.compliance.filter(d=>["Expired","Due soon"].includes(expStatus(d.reviewDate)));
 $("#stats").innerHTML=[
  ["👥",data.participants.length,"Participants"],["📅",pendingShifts.length,"Awaiting shift response"],
  ["💊",data.medications.filter(m=>m.active).length,"Active medications"],["🗂️",alerts.length,"Compliance alerts"]
 ].map(x=>`<article class="stat"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join("");
 $("#dashboard-shifts").innerHTML=pendingShifts.length?pendingShifts.slice(0,4).map(shiftCard).join(""):empty("No published shifts are awaiting a response.");
 $("#dashboard-compliance").innerHTML=alerts.length?alerts.slice(0,4).map(d=>`<article class="record"><div class="record-top"><div><h3>${esc(d.title)}</h3><p>${esc(d.scope)} · ${esc(d.subject)}</p></div>${badge(expStatus(d.reviewDate))}</div><div class="record-meta">${d.reviewDate?badge("Review "+date(d.reviewDate)):""}</div></article>`).join(""):empty("No compliance documents are due within 30 days.");
}
function shiftCard(s){
 let actions="";
 if(role==="supervisor"&&s.status==="Draft") actions=`<div class="actions"><button class="publish" data-publish="${s.id}">Publish shift</button></div>`;
 if(role==="staff"&&s.status==="Published"&&s.worker===data.profile.name&&s.response==="Pending") actions=`<div class="actions"><button class="accept" data-shift-response="${s.id}" data-response="Accepted">Accept</button><button class="decline" data-shift-response="${s.id}" data-response="Declined">Decline</button></div>`;
 return `<article class="record"><div class="record-top"><div><h3>${esc(s.participant)}</h3><p>${esc(s.type)} · ${esc(s.worker)}</p></div>${badge(s.status)}</div><p>${fmt(s.start)} to ${fmt(s.end)}</p><div class="record-meta">${badge(s.response)}</div>${actions}</article>`
}
function renderRoster(){
 let list=data.shifts.filter(s=>rosterTab==="draft"?s.status==="Draft":rosterTab==="mine"?s.worker===data.profile.name:s.status==="Published");
 $("#roster-list").innerHTML=list.length?list.sort((a,b)=>new Date(a.start)-new Date(b.start)).map(shiftCard).join(""):empty("No shifts in this view.");
}
function renderParticipants(){
 $("#participant-list").innerHTML=data.participants.map(p=>`<article class="person"><div class="avatar">${initials(p.name)}</div><div><div class="record-top"><div><h3>${esc(p.preferredName||p.name)}</h3><p>${esc(p.name)} · ${esc(p.address)}</p></div>${badge(p.status)}</div><p><strong>NDIS:</strong> ${esc(p.ndisNumber||"Not entered")}</p><p><strong>Diagnoses:</strong> ${esc(p.diagnoses)}</p><p><strong>Communication:</strong> ${esc(p.communication)}</p><p><strong>Goals:</strong> ${esc(p.goals)}</p><div class="record-meta"><button class="link" data-edit-participant="${p.id}">Edit detailed profile</button><button class="link" data-careplan="${p.id}">Upload care plan</button></div>${(p.documents||[]).map(d=>`<div class="document-row"><span>📎 ${esc(d.name)}</span><small>${date(d.uploadedAt)}</small></div>`).join("")}</div></article>`).join("")
}
function renderMeds(){
 if(medTab==="profiles") $("#med-content").innerHTML=data.medications.map(m=>`<article class="record"><div class="record-top"><div><h3>${esc(m.name)}</h3><p>${esc(m.participant)} · ${esc(m.dose)} · ${esc(m.route)}</p></div>${badge(m.type)}</div><p>${esc(m.instructions)}</p><div class="record-meta">${badge("Due "+m.time)}${badge(m.active?"Active":"Inactive")}</div></article>`).join("")||empty("No medication profiles.");
 else if(medTab==="history") $("#med-content").innerHTML=[...data.mar].reverse().map(m=>`<article class="record"><div class="record-top"><div><h3>${esc(m.medication)}</h3><p>${esc(m.participant)} · ${esc(m.worker)}</p></div>${badge(m.status)}</div><p>${fmt(m.recordedAt)}</p></article>`).join("")||empty("No MAR history.");
 else $("#med-content").innerHTML=data.medications.filter(m=>m.active).map(m=>`<article class="record"><div class="record-top"><div><h3>${esc(m.name)}</h3><p>${esc(m.participant)} · ${esc(m.dose)} · ${esc(m.route)}</p></div>${badge(m.time)}</div><p>${esc(m.instructions)}</p><div class="actions"><button class="accept" data-administer="${m.id}">Confirm given</button><button class="publish" data-mar-other="${m.id}" data-status="Withheld">Withheld</button><button class="decline" data-mar-other="${m.id}" data-status="Refused">Refused</button></div></article>`).join("")||empty("No medication is due.")
}
function renderNotes(){
 $("#note-list").innerHTML=[...data.notes].reverse().map(n=>`<article class="record"><div class="record-top"><div><h3>${esc(n.participant)}</h3><p>${esc(n.category)} · ${esc(n.worker)}</p></div>${badge(n.status)}</div><p>${esc(n.content)}</p><div class="record-meta">${badge(fmt(n.recordedAt))}</div></article>`).join("")||empty("No progress notes yet.")
}
function renderCompliance(){
 let docs=data.compliance.map(d=>({...d,computed:expStatus(d.reviewDate)}));
 if(complianceTab!=="all")docs=docs.filter(d=>d.scope.toLowerCase()===complianceTab);
 let counts={Current:0,"Due soon":0,Expired:0};docs.forEach(d=>counts[d.computed]=(counts[d.computed]||0)+1);
 $("#compliance-summary").innerHTML=[["✅",counts.Current,"Current"],["⏳",counts["Due soon"],"Due within 30 days"],["⚠️",counts.Expired,"Expired"],["📄",docs.length,"Evidence files"]].map(x=>`<article class="stat"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></article>`).join("");
 $("#compliance-list").innerHTML=docs.map(d=>`<article class="record"><div class="record-top"><div><h3>${esc(d.title)}</h3><p>${esc(d.scope)} · ${esc(d.subject)} · ${esc(d.category)}</p></div>${badge(d.computed)}</div><p>📎 ${esc(d.fileName)} · uploaded by ${esc(d.uploadedBy)} on ${date(d.uploadedAt)}</p><div class="record-meta">${d.reviewDate?badge("Review "+date(d.reviewDate)):badge("No expiry")}${d.dataUrl?`<button class="link" data-open-doc="${d.id}">Open file</button>`:""}</div></article>`).join("")||empty("No documents in this category.")
}
function renderFinance(){
 let connected=!!(C.xero?.clientId&&C.xero?.redirectUri);
 $("#xero-status").textContent=connected?"Xero credentials are configured. A secure OAuth backend is still required before live synchronisation.":"Not connected. Add your Xero app credentials in config.js.";
 $("#invoice-list").innerHTML=[...data.invoices].reverse().map(i=>`<article class="record"><div class="record-top"><div><h3>${esc(i.invoiceNumber)}</h3><p>${esc(i.participant)} · ${esc(i.description)}</p></div>${badge(i.status)}</div><p>${i.hours} hours × $${Number(i.rate).toFixed(2)} = <strong>$${Number(i.total).toFixed(2)}</strong></p><div class="record-meta">${badge(date(i.invoiceDate))}<button class="link" data-export-invoice="${i.id}">Export CSV</button>${connected?`<button class="link" data-send-xero="${i.id}">Send to Xero</button>`:""}</div></article>`).join("")||empty("No invoices have been created.")
}
const field=(name,label,type="text",options=[])=>type==="textarea"?`<label>${label}<textarea name="${name}" required></textarea></label>`:type==="select"?`<label>${label}<select name="${name}" required>${options.map(o=>`<option>${esc(o)}</option>`).join("")}</select></label>`:type==="file"?`<label>${label}<input name="${name}" type="file" required></label>`:`<label>${label}<input name="${name}" type="${type}" required></label>`;
function form(title,fields,handler,values={}){$("#dialog-title").textContent=title;$("#dialog-fields").innerHTML=fields.join("");Object.entries(values).forEach(([k,v])=>{let e=$(`[name="${k}"]`);if(e)e.value=v??""});pending=handler;$("#dialog").showModal()}
function closeDialog(){$("#dialog").close();pending=null}
async function fileToData(file){return await new Promise((res,rej)=>{let r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
$("#login-form").onsubmit=e=>{e.preventDefault();if($("#app-pin").value!==(C.demoAppPin||"123456"))return toast("Incorrect app PIN");role=$("#role").value;$("#login").classList.add("hidden");$("#app").classList.remove("hidden");$("#role-label").textContent=role==="supervisor"?"Supervisor workspace":"Support worker workspace";let h=new Date().getHours();$("#greeting").textContent=h<12?"Good morning":h<17?"Good afternoon":"Good evening";render()}
$("#menu").onclick=openDrawer;$("#scrim").onclick=closeDrawer;$("#logout").onclick=()=>location.reload();$("#bell").onclick=()=>toast("Notifications are up to date");
$$("[data-view]").forEach(b=>b.onclick=()=>showView(b.dataset.view));
$$("[data-roster-tab]").forEach(b=>b.onclick=()=>{$$("[data-roster-tab]").forEach(x=>x.classList.toggle("active",x===b));rosterTab=b.dataset.rosterTab;renderRoster()});
$$("[data-med-tab]").forEach(b=>b.onclick=()=>{$$("[data-med-tab]").forEach(x=>x.classList.toggle("active",x===b));medTab=b.dataset.medTab;renderMeds()});
$$("[data-compliance-tab]").forEach(b=>b.onclick=()=>{$$("[data-compliance-tab]").forEach(x=>x.classList.toggle("active",x===b));complianceTab=b.dataset.complianceTab;renderCompliance()});
$("#add-participant").onclick=()=>form("Add participant",[field("name","Full legal name"),field("preferredName","Preferred name"),field("dob","Date of birth","date"),field("ndisNumber","NDIS number"),field("address","Address"),field("phone","Phone"),field("emergencyContact","Emergency contact"),field("guardian","Guardian or nominee"),field("gp","GP"),field("pharmacy","Pharmacy"),field("communication","Communication needs","textarea"),field("diagnoses","Diagnoses","textarea"),field("allergies","Allergies"),field("goals","NDIS goals","textarea"),field("preferences","Preferences and support needs","textarea"),field("risks","Known risks and safeguards","textarea"),field("fundingStart","Plan start","date"),field("fundingEnd","Plan end","date"),field("status","Status","select",["Active","Inactive"])],v=>{data.participants.push({id:id(),documents:[],...v});save();toast("Participant added")});
document.addEventListener("click",async e=>{
 let b=e.target.closest("[data-publish]");if(b){let s=data.shifts.find(x=>x.id===b.dataset.publish);s.status="Published";s.response="Pending";save();return toast("Shift published to "+s.worker)}
 b=e.target.closest("[data-shift-response]");if(b){let s=data.shifts.find(x=>x.id===b.dataset.shiftResponse);s.response=b.dataset.response;save();return toast("Shift "+b.dataset.response.toLowerCase())}
 b=e.target.closest("[data-administer]");if(b){pendingMed={med:data.medications.find(x=>x.id===b.dataset.administer),status:"Administered"};$("#pin-summary").textContent=`${pendingMed.med.name} · ${pendingMed.med.dose} for ${pendingMed.med.participant}`;$("#pin-dialog").showModal();return}
 b=e.target.closest("[data-mar-other]");if(b){let m=data.medications.find(x=>x.id===b.dataset.marOther);data.mar.push({id:id(),medication:m.name,participant:m.participant,status:b.dataset.status,worker:data.profile.name,recordedAt:iso()});save();return toast("MAR recorded: "+b.dataset.status)}
 b=e.target.closest("[data-edit-participant]");if(b){let p=data.participants.find(x=>x.id===b.dataset.editParticipant);form("Edit detailed participant profile",[field("name","Full legal name"),field("preferredName","Preferred name"),field("dob","Date of birth","date"),field("ndisNumber","NDIS number"),field("address","Address"),field("phone","Phone"),field("emergencyContact","Emergency contact"),field("guardian","Guardian or nominee"),field("gp","GP"),field("pharmacy","Pharmacy"),field("communication","Communication needs","textarea"),field("diagnoses","Diagnoses","textarea"),field("allergies","Allergies"),field("goals","NDIS goals","textarea"),field("preferences","Preferences and support needs","textarea"),field("risks","Known risks and safeguards","textarea"),field("fundingStart","Plan start","date"),field("fundingEnd","Plan end","date"),field("status","Status","select",["Active","Inactive"])],v=>{Object.assign(p,v);save();toast("Participant profile updated")},p);return}
 b=e.target.closest("[data-careplan]");if(b){let p=data.participants.find(x=>x.id===b.dataset.careplan);form("Upload participant care plan",[field("title","Document title"),field("file","PDF care plan","file"),field("reviewDate","Review date","date")],async(v,fd)=>{let f=fd.get("file");if(f.type!=="application/pdf")throw Error("Care plan must be a PDF");if(f.size>C.maxDocumentBytes)throw Error("File is too large");p.documents.push({id:id(),name:f.name,title:v.title,reviewDate:v.reviewDate,uploadedAt:iso(),dataUrl:await fileToData(f)});save();toast("Care plan uploaded")});return}
 b=e.target.closest("[data-open-doc]");if(b){let d=data.compliance.find(x=>x.id===b.dataset.openDoc);if(d?.dataUrl)open(d.dataUrl,"_blank");return}
 b=e.target.closest("[data-export-invoice]");if(b){let i=data.invoices.find(x=>x.id===b.dataset.exportInvoice);let csv=`Invoice Number,Participant,Description,Hours,Rate,Total,Date,Status\n"${i.invoiceNumber}","${i.participant}","${i.description}",${i.hours},${i.rate},${i.total},${i.invoiceDate},${i.status}`;download(csv,i.invoiceNumber+".csv","text/csv");return}
 b=e.target.closest("[data-send-xero]");if(b)return toast("Live Xero OAuth backend is not connected yet");
});
$("#add-shift").onclick=()=>form("Create roster shift",[field("participant","Participant","select",data.participants.map(p=>p.name)),field("worker","Assigned staff member","select",data.staff.map(s=>s.name)),field("start","Start","datetime-local"),field("end","Finish","datetime-local"),field("type","Shift type","select",["24-hour support","Personal care","Community access","Social support","Sleepover","Transport"]),field("status","Save as","select",["Draft","Published"]),field("notes","Shift instructions","textarea")],v=>{v.start=new Date(v.start).toISOString();v.end=new Date(v.end).toISOString();v.response=v.status==="Published"?"Pending":"Not sent";data.shifts.push({id:id(),...v});save();toast(v.status==="Published"?"Shift published":"Draft shift saved")});
$("#add-med").onclick=()=>form("Add medication profile",[field("participant","Participant","select",data.participants.map(p=>p.name)),field("name","Medication name"),field("dose","Dose"),field("route","Route","select",["Oral","Topical","Inhaled","Subcutaneous","Other"]),field("time","Administration time","time"),field("type","Type","select",["Regular","PRN","Schedule 8"]),field("instructions","Administration instructions","textarea")],v=>{data.medications.push({id:id(),active:true,...v});save();toast("Medication profile added")});
$("#add-note").onclick=()=>form("Create progress note",[field("participant","Participant","select",data.participants.map(p=>p.name)),field("category","Note type","select",["Daily support","Personal care","Community access","Health","Communication","Goals and outcomes","Behaviour observation"]),field("content","What support was provided and what was the outcome?","textarea"),field("status","Save note as","select",["Final","Draft"])],v=>{data.notes.push({id:id(),worker:data.profile.name,recordedAt:iso(),...v});save();toast("Progress note saved")});
$("#upload-compliance").onclick=()=>form("Upload compliance evidence",[field("scope","Document area","select",["Staff","Participant","Organisation"]),field("subject","Staff member, participant or organisation"),field("category","Document type","select",["Service agreement","Care plan","NDIS plan","Consent","Risk assessment","Medication chart","Allied health report","Police check","NDIS Worker Screening","Blue Card","First Aid","CPR","Medication competency","Driver licence","Vehicle registration","Vehicle insurance","Policy and procedure","Incident register","Complaints register","Continuous improvement","Internal audit","Staff meeting minutes","Emergency management","Other"]),field("title","Document title"),field("reviewDate","Expiry or review date","date"),field("file","Choose document or photo","file")],async(v,fd)=>{let f=fd.get("file");if(!C.acceptedDocumentTypes.includes(f.type))throw Error("This file type is not accepted");if(f.size>C.maxDocumentBytes)throw Error("File is larger than the allowed limit");data.compliance.push({id:id(),...v,fileName:f.name,mime:f.type,uploadedAt:iso(),uploadedBy:data.profile.name,status:"Current",dataUrl:await fileToData(f)});save();toast("Compliance evidence uploaded")});
$("#create-invoice").onclick=()=>form("Create invoice",[field("participant","Participant","select",data.participants.map(p=>p.name)),field("description","NDIS support or line item"),field("hours","Billable hours","number"),field("rate","Hourly rate","number"),field("invoiceDate","Invoice date","date")],v=>{let num="ICC-"+String(data.invoices.length+1).padStart(4,"0");data.invoices.push({id:id(),invoiceNumber:num,total:Number(v.hours)*Number(v.rate),status:"Draft",...v});save();toast("Invoice created")});
$("#connect-xero").onclick=()=>toast("Add Xero OAuth credentials to config.js and use a secure backend callback");
$("#backup").onclick=()=>download(JSON.stringify(data,null,2),"florence-backup-"+new Date().toISOString().slice(0,10)+".json","application/json");
function download(content,name,type){let a=document.createElement("a");a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}
$("#dynamic-form").onsubmit=async e=>{e.preventDefault();if(!pending)return;let fd=new FormData(e.currentTarget),v=Object.fromEntries(fd.entries());try{await pending(v,fd);$("#dialog").close();pending=null;e.currentTarget.reset()}catch(err){toast(err.message||"Could not save")}}
$("#close-dialog").onclick=$("#cancel-dialog").onclick=closeDialog;
$("#pin-form").onsubmit=e=>{e.preventDefault();if($("#med-pin").value!==(data.profile.medicationPin||C.demoMedicationPin))return toast("Incorrect medication PIN");let m=pendingMed.med;data.mar.push({id:id(),medication:m.name,participant:m.participant,status:"Administered",worker:data.profile.name,recordedAt:iso(),pinVerified:true});save();$("#pin-dialog").close();$("#med-pin").value="";pendingMed=null;toast("Medication administration recorded")}
$("#close-pin").onclick=$("#cancel-pin").onclick=()=>{$("#pin-dialog").close();pendingMed=null};
render();
})();