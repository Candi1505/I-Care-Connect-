(()=>{
"use strict";

const B=()=>window.FlorenceBridge;
const q=(selector,root=document)=>root.querySelector(selector);
const qa=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[character]));
const money=value=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(value||0));
const iso=value=>new Date(value).toISOString().slice(0,10);
const DAY_MS=86400000;
const EVELYN_NDIS_NUMBER="430178932";
const AGREEMENT_SOURCE="Evelyn service agreement 2026–27";
const AGREEMENT_EFFECTIVE_FROM="2026-07-01";
const EVELYN_SERVICES=[
 {id:"agreement:01_801_0138_1_1",template_name:"SIL – Weekday daytime",shift_type:"24-hour support",day_category:"Weekday",support_item_number:"01_801_0138_1_1",support_item_name:"Supported Independent Living - Standard - Weekday Daytime",unit:"Hour",unit_price:74,claim_type:"Standard"},
 {id:"agreement:01_802_0138_1_1",template_name:"SIL – Weekday evening",shift_type:"24-hour support",day_category:"Weekday",support_item_number:"01_802_0138_1_1",support_item_name:"Supported Independent Living - Standard - Weekday Evening",unit:"Hour",unit_price:81,claim_type:"Standard"},
 {id:"agreement:01_803_0138_1_1",template_name:"SIL – Weekday night",shift_type:"24-hour support",day_category:"Weekday",support_item_number:"01_803_0138_1_1",support_item_name:"Supported Independent Living - Standard - Weekday Night",unit:"Hour",unit_price:83,claim_type:"Standard"},
 {id:"agreement:01_804_0138_1_1",template_name:"SIL – Saturday",shift_type:"24-hour support",day_category:"Saturday",support_item_number:"01_804_0138_1_1",support_item_name:"Supported Independent Living - Standard - Saturday",unit:"Hour",unit_price:104,claim_type:"Standard"},
 {id:"agreement:01_805_0138_1_1",template_name:"SIL – Sunday",shift_type:"24-hour support",day_category:"Sunday",support_item_number:"01_805_0138_1_1",support_item_name:"Supported Independent Living - Standard - Sunday",unit:"Hour",unit_price:134,claim_type:"Standard"},
 {id:"agreement:01_806_0138_1_1",template_name:"SIL – Public holiday",shift_type:"24-hour support",day_category:"",support_item_number:"01_806_0138_1_1",support_item_name:"Supported Independent Living - Standard - Public Holiday",unit:"Hour",unit_price:163,claim_type:"Standard"},
 {id:"agreement:01_832_0138_1_1",template_name:"SIL – Night-time sleepover",shift_type:"Sleepover",day_category:"",support_item_number:"01_832_0138_1_1",support_item_name:"Supported Independent Living - Night-Time Sleepover",unit:"Each",unit_price:312,claim_type:"Standard"},
 {id:"agreement:04_104_0125_6_1",template_name:"Community access – Weekday daytime",shift_type:"Community access",day_category:"Weekday",support_item_number:"04_104_0125_6_1",support_item_name:"Access Community Social and Rec Activ - Standard - Weekday Daytime",unit:"Hour",unit_price:73,claim_type:"Standard"}
].map(service=>({...service,agreement:true,price_source:AGREEMENT_SOURCE,pricing_effective_from:AGREEMENT_EFFECTIVE_FROM}));
const EVELYN_RATES=new Map(EVELYN_SERVICES.map(service=>[service.support_item_number,service.unit_price]));

let busy=false;
let currentInvoice=null;
let participants=[];
let templates=[];
let selectedShifts=[];

window.FlorenceInvoicePresets={participant:"Evelyn Jane Tait",ndisNumber:EVELYN_NDIS_NUMBER,source:AGREEMENT_SOURCE,effectiveFrom:AGREEMENT_EFFECTIVE_FROM,items:EVELYN_SERVICES.map(service=>({...service}))};

function toast(message){B()?.toast?.(message)}

async function context(){
 const bridge=B();
 if(!bridge?.db)throw new Error("Florence is still loading. Try again in a moment.");
 const profile=await bridge.ensureReady?.()||bridge.profile;
 if(!profile?.organisation_id)throw new Error("Florence could not load your organisation. Sign out, then sign in again.");
 if(profile.role!=="supervisor")throw new Error("NDIS invoicing is available to supervisors only.");
 return {bridge,db:bridge.db,profile,organisationId:profile.organisation_id};
}

function addDays(value,days){return iso(new Date(`${iso(value)}T12:00:00`).getTime()+days*DAY_MS)}
function dayCategory(value){const day=new Date(value).getDay();return day===6?"Saturday":day===0?"Sunday":"Weekday"}
function hours(start,end){return Math.max(0,(new Date(end)-new Date(start))/3600000)}
function participantById(id){return participants.find(participant=>participant.id===id)}
function isEvelyn(participant){return String(participant?.ndis_number||"").replace(/\s/g,"")===EVELYN_NDIS_NUMBER||/\bevelyn\b/i.test(participant?.full_name||"")}
function selectedParticipant(){return participantById(q("#smart-participant")?.value)}
function selectableTemplates(){
 const participant=selectedParticipant();
 const saved=templates.filter(template=>!template.participant_id||template.participant_id===participant?.id);
 if(!isEvelyn(participant))return saved;
 const agreedCodes=new Set(EVELYN_SERVICES.map(service=>service.support_item_number));
 return [...EVELYN_SERVICES,...saved.filter(template=>!agreedCodes.has(template.support_item_number))];
}
function templateById(id){return selectableTemplates().find(template=>String(template.id)===String(id))}

function agreementButtons(){
 return EVELYN_SERVICES.map(service=>`<button type="button" class="secondary" data-evelyn-service="${esc(service.id)}"><strong>${esc(service.template_name)}</strong><br><small>${esc(service.support_item_number)} · ${service.unit==="Each"?`${money(service.unit_price)} each`:`${money(service.unit_price)}/hr`}</small></button>`).join("");
}

function install(){
 const bridge=B();
 if(!bridge?.profile||bridge.profile.role!=="supervisor")return false;
 const view=q("#finance-view");
 if(!view)return false;
 if(view.dataset.smartInvoicingInstalled==="true")return true;
 view.dataset.smartInvoicingInstalled="true";
 const nav=q('[data-view="finance"]');
 if(nav)nav.textContent="💳 NDIS invoicing";
 view.innerHTML=`
<div class="page-head"><div><p class="eyebrow">Business billing</p><h2>NDIS invoicing</h2><p>Create invoices from Florence shifts, apply agreed services and prepare professional invoices for email.</p></div><div class="actions"><button id="smart-invoice-new" class="primary">+ Create invoice</button><button id="smart-template-new" class="secondary">Other service templates</button></div></div>
<article class="notice"><strong>Pricing safety</strong><br>Use the participant's signed service agreement and confirm price changes before invoicing. SCHADS rates are used only for internal staffing-cost checks.</article>
<div id="smart-invoice-summary" class="stats"></div>
<article id="evelyn-invoice-presets" class="panel"><div class="panel-head"><div><p class="eyebrow">Evelyn Jane Tait</p><h3>Approved services — ready to use</h3><p>Start an invoice with any service below. Florence uses the exact 2026–27 agreement code and rate.</p></div><span class="badge good">8 services</span></div><div class="actions agreement-service-buttons">${agreementButtons()}</div><p class="record-meta">Fortnightly invoicing · payment due in 7 days · rates effective 1 July 2026. Public holidays and weekday time bands require VJ's review.</p></article>
<article class="panel"><div class="panel-head"><div><h3>Invoices</h3><p>Draft, ready, sent, overdue and paid records.</p></div><button id="smart-invoice-refresh" class="secondary">Refresh</button></div><div id="smart-invoice-list" class="stack"></div></article>
<article id="smart-invoice-editor" class="panel hidden"><div class="panel-head"><div><p class="eyebrow">Smart invoice</p><h3 id="smart-editor-title">Create invoice</h3><p>Choose agreed services directly or import past roster shifts for review.</p></div><button id="smart-editor-close" class="link">Close</button></div>
<form id="smart-invoice-form"><div class="grid two">
<label>Participant<select id="smart-participant" required></select></label><label>Invoice number<input id="smart-number" required></label>
<label>Invoice date<input id="smart-date" type="date" required></label><label>Due date<input id="smart-due" type="date" required></label>
<label>Recipient type<select id="smart-recipient-type"><option>Plan manager</option><option>Participant</option><option>Nominee</option><option>Self-managed contact</option></select></label><label>Recipient name<input id="smart-recipient-name" placeholder="Add when confirmed"></label>
<label>Recipient email<input id="smart-recipient-email" type="email" placeholder="Add when confirmed"></label><label>Status<select id="smart-status"><option>Draft</option><option>Ready to send</option><option>Sent</option><option>Paid</option></select></label>
<label>Service period start<input id="smart-period-start" type="date"></label><label>Service period end<input id="smart-period-end" type="date"></label>
</div><div class="actions"><button id="smart-last-fortnight" type="button" class="secondary">Use last 14 days</button></div><label>Invoice notes<textarea id="smart-notes" placeholder="Optional payment or service information"></textarea></label>
<article id="smart-agreement-panel" class="notice hidden"><strong>Evelyn's approved services</strong><br>Tap each service needed. Add hours for hourly services; sleepover is one item per occurrence.<div id="smart-agreement-picker" class="actions agreement-service-buttons"></div></article>
<article class="notice"><strong>Import past Florence shifts</strong><br>Florence excludes shifts already linked to another invoice. Review weekday time bands and public holidays before saving.</article>
<div class="grid two"><label>From<input id="smart-shift-from" type="date"></label><label>To<input id="smart-shift-to" type="date"></label></div>
<div class="actions"><button id="smart-find-shifts" type="button" class="secondary">Find past roster shifts</button><button id="smart-import-shifts" type="button" class="primary" disabled>Import selected shifts</button></div>
<div id="smart-shift-results" class="stack"></div>
<div class="panel-head"><div><h3>Invoice lines</h3><p>Every line needs an agreed support-item code, quantity and rate.</p></div><button id="smart-add-line" type="button" class="secondary">+ Add manual line</button></div>
<div id="smart-lines" class="stack"></div><div class="record-top"><strong>Total</strong><strong id="smart-total">$0.00</strong></div>
<div id="smart-review" class="notice"></div>
<div class="actions"><button class="primary" type="submit">Save invoice</button><button id="smart-print" type="button" class="secondary">Print / save PDF</button><button id="smart-email" type="button" class="secondary">Prepare email</button></div></form></article>
<article id="smart-template-panel" class="panel hidden"><div class="panel-head"><div><p class="eyebrow">Reusable billing codes</p><h3>Other service templates</h3><p>Evelyn's agreement is already available above. Save other approved codes here.</p></div><button id="smart-template-close" class="link">Close</button></div>
<form id="smart-template-form"><div class="grid two"><label>Template name<input id="template-name" required></label><label>Shift type<select id="template-shift-type"><option value="">Any shift type</option><option>24-hour support</option><option>Personal care</option><option>Community access</option><option>Social support</option><option>Sleepover</option><option>Transport</option><option>Domestic assistance</option></select></label><label>Day category<select id="template-day"><option value="">Any day</option><option>Weekday</option><option>Saturday</option><option>Sunday</option></select></label><label>Support item code<input id="template-code"></label><label>Support item name<input id="template-item-name" required></label><label>Unit<select id="template-unit"><option>Hour</option><option>Each</option><option>Kilometre</option><option>Day</option></select></label><label>Unit price<input id="template-price" type="number" min="0" step="0.01" required></label><label>Claim type<input id="template-claim" placeholder="Standard, travel, cancellation..."></label><label>Recipient name<input id="template-recipient-name"></label><label>Recipient email<input id="template-recipient-email" type="email"></label><label>Price effective from<input id="template-effective" type="date"></label><label>Review date<input id="template-review" type="date"></label></div><button class="primary">Save template</button></form><div id="smart-template-list" class="stack"></div></article>`;

 q("#smart-invoice-new").onclick=()=>void openEditor();
 q("#smart-invoice-refresh").onclick=()=>void loadInvoices();
 q("#smart-template-new").onclick=()=>void openTemplates();
 q("#smart-template-close").onclick=()=>q("#smart-template-panel").classList.add("hidden");
 q("#smart-editor-close").onclick=()=>q("#smart-invoice-editor").classList.add("hidden");
 q("#smart-add-line").onclick=()=>addLine();
 q("#smart-last-fortnight").onclick=()=>setFortnightDefaults();
 q("#smart-find-shifts").onclick=()=>void findShifts();
 q("#smart-import-shifts").onclick=()=>importShifts();
 q("#smart-invoice-form").onsubmit=event=>{event.preventDefault();void saveInvoice()};
 q("#smart-template-form").onsubmit=event=>{event.preventDefault();void saveTemplate()};
 q("#smart-print").onclick=printInvoice;
 q("#smart-email").onclick=prepareEmail;
 q("#smart-date").onchange=()=>{q("#smart-due").value=addDays(q("#smart-date").value,7)};
 q("#smart-participant").onchange=()=>{renderAgreementPicker();refreshLineTemplateChoices()};
 view.addEventListener("click",event=>{
  const button=event.target.closest("[data-evelyn-service]");
  if(button)void startEvelynService(button.dataset.evelynService);
 });
 void loadInvoices();
 return true;
}

function setFortnightDefaults(endValue=iso(new Date())){
 const end=iso(endValue);
 const start=addDays(end,-13);
 q("#smart-period-start").value=start;
 q("#smart-period-end").value=end;
 q("#smart-shift-from").value=start;
 q("#smart-shift-to").value=end;
}

function templateOptions(selectedId=""){
 const options=['<option value="">Choose agreed service / manual line</option>',...selectableTemplates().map(template=>`<option value="${esc(template.id)}"${String(template.id)===String(selectedId)?" selected":""}>${template.agreement?"Evelyn agreement · ":""}${esc(template.template_name)}</option>`)].join("");
 return options;
}

function lineTemplate(item={}){
 return `<article class="record smart-line" data-shift-id="${esc(item.shift_id||"")}" data-pricing-effective-from="${esc(item.pricing_effective_from||"")}"><label>Agreed service<select data-k="template_id">${templateOptions(item.template_id)}</select></label><div class="grid two"><label>Service date<input data-k="service_date" type="date" value="${esc(item.service_date||iso(new Date()))}" required></label><label>Support item code<input data-k="support_item_number" value="${esc(item.support_item_number||"")}" required></label><label>Support item name<input data-k="support_item_name" value="${esc(item.support_item_name||"")}" required></label><label>Unit<select data-k="unit"><option>Hour</option><option>Each</option><option>Kilometre</option><option>Day</option></select></label><label>Quantity<input data-k="quantity" type="number" min="0.001" step="0.001" value="${item.quantity||1}" required></label><label>Unit price<input data-k="unit_price" type="number" min="0" step="0.01" value="${item.unit_price||0}" required></label><label>Claim type<input data-k="claim_type" value="${esc(item.claim_type||"")}"></label><label>Price source<input data-k="price_source" value="${esc(item.price_source||"Service agreement / approved template")}"></label></div><div class="record-top"><span data-line-total>${money((item.quantity||1)*(item.unit_price||0))}</span><button type="button" class="link" data-remove>Remove</button></div></article>`;
}

function applyTemplateToLine(line,template){
 if(!template)return;
 const values={support_item_number:template.support_item_number||"",support_item_name:template.support_item_name,unit:template.unit,unit_price:template.unit_price,claim_type:template.claim_type||"",price_source:template.price_source||"Saved service template"};
 for(const [key,value] of Object.entries(values)){
  const field=q(`[data-k="${key}"]`,line);
  if(field)field.value=value;
 }
 line.dataset.pricingEffectiveFrom=template.pricing_effective_from||"";
 if(template.unit==="Each")q('[data-k="quantity"]',line).value="1";
 recalc();
}

function wireLine(line){
 const select=q('[data-k="template_id"]',line);
 select.onchange=()=>applyTemplateToLine(line,templateById(select.value));
 line.addEventListener("input",recalc);
 q("[data-remove]",line).onclick=()=>{line.remove();recalc()};
}

function addLine(item={}){
 const box=document.createElement("div");
 box.innerHTML=lineTemplate(item);
 const line=box.firstElementChild;
 q("#smart-lines").appendChild(line);
 const unit=q('[data-k="unit"]',line);
 if(item.unit)unit.value=item.unit;
 wireLine(line);
 recalc();
 return line;
}

function refreshLineTemplateChoices(){
 qa(".smart-line").forEach(line=>{
  const select=q('[data-k="template_id"]',line);
  const selected=select.value;
  select.innerHTML=templateOptions(selected);
 });
}

function removeEmptyStarterLine(){
 const lines=qa(".smart-line");
 if(lines.length!==1)return;
 const line=lines[0];
 if(!q('[data-k="support_item_name"]',line).value&&!q('[data-k="support_item_number"]',line).value)line.remove();
}

function addAgreementLine(service){
 removeEmptyStarterLine();
 const line=addLine({
  template_id:service.id,
  service_date:q("#smart-period-end")?.value||iso(new Date()),
  support_item_number:service.support_item_number,
  support_item_name:service.support_item_name,
  unit:service.unit,
  quantity:1,
  unit_price:service.unit_price,
  claim_type:service.claim_type,
  price_source:AGREEMENT_SOURCE,
  pricing_effective_from:AGREEMENT_EFFECTIVE_FROM
 });
 line.scrollIntoView({behavior:"smooth",block:"nearest"});
 toast(`${service.template_name} added — enter ${service.unit==="Each"?"the number of occurrences":"the hours"}`);
}

async function startEvelynService(serviceId){
 const service=EVELYN_SERVICES.find(item=>item.id===serviceId);
 if(!service)return;
 const editor=q("#smart-invoice-editor");
 if(!editor||editor.classList.contains("hidden"))await openEditor();
 const evelyn=participants.find(isEvelyn);
 const participantSelect=q("#smart-participant");
 if(evelyn&&participantSelect.value!==evelyn.id){
  const hasEnteredLines=collectLines().length>0;
  if(hasEnteredLines)return toast("Finish or close the current participant's invoice before starting Evelyn's invoice");
  participantSelect.value=evelyn.id;
 }
 renderAgreementPicker();
 refreshLineTemplateChoices();
 addAgreementLine(service);
}

function renderAgreementPicker(){
 const panel=q("#smart-agreement-panel");
 if(!panel)return;
 const visible=isEvelyn(selectedParticipant());
 panel.classList.toggle("hidden",!visible);
 q("#smart-agreement-picker").innerHTML=visible?agreementButtons():"";
}

function renderReview(){
 const review=q("#smart-review");
 if(!review)return;
 const lines=collectLines();
 if(!lines.length){review.innerHTML="<strong>Review needed</strong><br>Add at least one agreed service before saving.";return}
 const missingCode=lines.filter(line=>!line.support_item_number.trim()).length;
 const missingRate=lines.filter(line=>Number(line.unit_price)<=0).length;
 const wrongParticipant=!isEvelyn(selectedParticipant())&&lines.some(line=>EVELYN_RATES.has(line.support_item_number));
 const changedAgreementRate=lines.filter(line=>EVELYN_RATES.has(line.support_item_number)&&Number(line.unit_price)!==EVELYN_RATES.get(line.support_item_number)).length;
 const details=[];
 if(missingCode)details.push(`${missingCode} missing support-item code`);
 if(missingRate)details.push(`${missingRate} missing rate`);
 if(wrongParticipant)details.push("Evelyn agreement code selected for another participant");
 if(changedAgreementRate)details.push(`${changedAgreementRate} rate${changedAgreementRate===1?"":"s"} changed from Evelyn's agreement`);
 if(details.length){review.innerHTML=`<strong>Review needed</strong><br>${esc(details.join(" · "))}`;return}
 review.innerHTML=`<strong>Ready for VJ's final review</strong><br>${lines.length} service line${lines.length===1?"":"s"} · ${esc(q("#smart-total").textContent)}. Confirm hours, dates, time bands and public holidays before saving.`;
}

function recalc(){
 let total=0;
 qa(".smart-line").forEach(line=>{
  const quantity=Number(q('[data-k="quantity"]',line)?.value||0);
  const rate=Number(q('[data-k="unit_price"]',line)?.value||0);
  const value=quantity*rate;
  total+=value;
  q("[data-line-total]",line).textContent=money(value);
 });
 q("#smart-total").textContent=money(total);
 renderReview();
 return total;
}

async function loadBase(){
 const {db,organisationId}=await context();
 const [{data:participantRows,error:participantError},{data:templateRows,error:templateError}]=await Promise.all([
  db.from("participants").select("id,full_name,ndis_number,guardian_nominee").eq("organisation_id",organisationId).eq("status","Active").order("full_name"),
  db.from("invoice_service_templates").select("*").eq("organisation_id",organisationId).eq("active",true).order("template_name")
 ]);
 if(participantError)throw participantError;
 if(templateError)throw templateError;
 participants=participantRows||[];
 templates=templateRows||[];
}

async function openEditor(invoice=null){
 try{
  const {db}=await context();
  await loadBase();
  currentInvoice=invoice;
  selectedShifts=[];
  q("#smart-participant").innerHTML=participants.map(participant=>`<option value="${participant.id}">${esc(participant.full_name)}${participant.ndis_number?` · ${esc(participant.ndis_number)}`:""}</option>`).join("");
  q("#smart-number").value=invoice?.invoice_number||`ICC-${iso(new Date()).replaceAll("-","")}-${String(Date.now()).slice(-4)}`;
  q("#smart-date").value=invoice?.invoice_date||iso(new Date());
  q("#smart-due").value=invoice?.due_date||addDays(q("#smart-date").value,7);
  q("#smart-recipient-type").value=invoice?.recipient_type||"Plan manager";
  q("#smart-recipient-name").value=invoice?.recipient_name||"";
  q("#smart-recipient-email").value=invoice?.recipient_email||"";
  q("#smart-status").value=invoice?.status||"Draft";
  q("#smart-notes").value=invoice?.notes||"";
  if(invoice?.participant_id)q("#smart-participant").value=invoice.participant_id;
  else{
   const evelyn=participants.find(isEvelyn);
   if(evelyn)q("#smart-participant").value=evelyn.id;
  }
  setFortnightDefaults(invoice?.service_period_end||iso(new Date()));
  if(invoice?.service_period_start)q("#smart-period-start").value=invoice.service_period_start;
  if(invoice?.service_period_end)q("#smart-period-end").value=invoice.service_period_end;
  q("#smart-lines").innerHTML="";
  let items=[];
  if(invoice){
   const {data,error}=await db.from("invoice_items").select("*").eq("invoice_id",invoice.id).order("service_date");
   if(error)throw error;
   items=data||[];
  }
  for(const item of items.length?items:[{}])addLine(item);
  q("#smart-shift-results").innerHTML="";
  q("#smart-import-shifts").disabled=true;
  q("#smart-editor-title").textContent=invoice?`Invoice ${invoice.invoice_number}`:"Create Evelyn invoice";
  renderAgreementPicker();
  refreshLineTemplateChoices();
  q("#smart-invoice-editor").classList.remove("hidden");
  q("#smart-invoice-editor").scrollIntoView({behavior:"smooth"});
 }catch(error){toast(error.message||"Florence could not open smart invoicing")}
}

async function findShifts(){
 try{
  const {db,organisationId}=await context();
  const participant=q("#smart-participant").value;
  const from=q("#smart-shift-from").value;
  const to=q("#smart-shift-to").value;
  if(!participant||!from||!to)return toast("Choose a participant and date range");
  const {data:linked,error:linkedError}=await db.from("invoice_shift_links").select("shift_id").eq("organisation_id",organisationId);
  if(linkedError)throw linkedError;
  const used=new Set((linked||[]).map(row=>row.shift_id));
  const {data,error}=await db.from("shifts").select("id,starts_at,ends_at,shift_type,status,response,assigned_staff_id").eq("organisation_id",organisationId).eq("participant_id",participant).eq("status","Published").gte("starts_at",`${from}T00:00:00+10:00`).lte("starts_at",`${to}T23:59:59+10:00`).lt("ends_at",new Date().toISOString()).order("starts_at");
  if(error)throw error;
  selectedShifts=(data||[]).filter(shift=>!used.has(shift.id)&&!/declined/i.test(shift.response||""));
  q("#smart-shift-results").innerHTML=selectedShifts.length?selectedShifts.map(shift=>`<label class="record"><input type="checkbox" data-smart-shift="${shift.id}" checked><strong>${new Date(shift.starts_at).toLocaleDateString("en-AU")}</strong> · ${esc(shift.shift_type)} · ${hours(shift.starts_at,shift.ends_at).toFixed(2)} hrs · ${dayCategory(shift.starts_at)}${shift.response?` · ${esc(shift.response)}`:""}</label>`).join(""):'<div class="empty">No uninvoiced past shifts found in this period.</div>';
  q("#smart-import-shifts").disabled=!selectedShifts.length;
 }catch(error){toast(error.message||"Florence could not load roster shifts")}
}

function matchTemplate(shift){
 const day=dayCategory(shift.starts_at);
 const type=String(shift.shift_type||"").toLowerCase();
 if(isEvelyn(selectedParticipant())){
  if(type.includes("sleepover"))return EVELYN_SERVICES.find(service=>service.support_item_number==="01_832_0138_1_1");
  if(type.includes("community")&&day==="Weekday")return EVELYN_SERVICES.find(service=>service.support_item_number==="04_104_0125_6_1");
  const silShift=type.includes("24-hour")||type.includes("supported independent")||type==="sil";
  if(day==="Saturday"&&silShift)return EVELYN_SERVICES.find(service=>service.support_item_number==="01_804_0138_1_1");
  if(day==="Sunday"&&silShift)return EVELYN_SERVICES.find(service=>service.support_item_number==="01_805_0138_1_1");
  return null;
 }
 return templates.find(template=>(!template.shift_type||template.shift_type===shift.shift_type)&&(!template.day_category||template.day_category===day))||templates.find(template=>!template.participant_id&&(!template.shift_type||template.shift_type===shift.shift_type))||null;
}

function importShifts(){
 const selectedIds=new Set(qa("[data-smart-shift]:checked").map(input=>input.dataset.smartShift));
 for(const shift of selectedShifts.filter(item=>selectedIds.has(item.id))){
  const template=matchTemplate(shift);
  addLine({shift_id:shift.id,service_date:iso(shift.starts_at),template_id:template?.id||"",support_item_number:template?.support_item_number||"",support_item_name:template?.support_item_name||shift.shift_type,unit:template?.unit||"Hour",quantity:template?.unit==="Each"?1:Number(hours(shift.starts_at,shift.ends_at).toFixed(3)),unit_price:Number(template?.unit_price||0),claim_type:template?.claim_type||"",price_source:template?.price_source||"Review against signed service agreement",pricing_effective_from:template?.pricing_effective_from||""});
 }
 removeEmptyStarterLine();
 q("#smart-shift-results").innerHTML="";
 q("#smart-import-shifts").disabled=true;
 toast("Selected shifts imported — review codes, time bands and rates");
}

function collectLines(){
 return qa(".smart-line").map(line=>({
  shift_id:line.dataset.shiftId||null,
  pricing_effective_from:line.dataset.pricingEffectiveFrom||null,
  ...Object.fromEntries(qa("[data-k]",line).map(field=>[field.dataset.k,field.value]))
 })).filter(line=>line.support_item_name&&Number(line.quantity)>0);
}

async function saveInvoice(){
 if(busy)return;
 const lines=collectLines();
 if(!lines.length)return toast("Add at least one invoice line");
 if(lines.some(line=>!line.support_item_number.trim()))return toast("Every invoice line needs an agreed support-item code");
 if(lines.some(line=>Number(line.unit_price)<=0))return toast("Every invoice line needs a confirmed rate above $0");
 if(!isEvelyn(selectedParticipant())&&lines.some(line=>EVELYN_RATES.has(line.support_item_number)))return toast("Evelyn's agreement codes can only be saved on Evelyn's invoice");
 if(q("#smart-period-start").value&&q("#smart-period-end").value&&q("#smart-period-start").value>q("#smart-period-end").value)return toast("Service period start must be before the end date");
 busy=true;
 try{
  const {db,profile,organisationId}=await context();
  const total=recalc();
  const payload={organisation_id:organisationId,participant_id:q("#smart-participant").value,invoice_number:q("#smart-number").value.trim(),description:lines.map(line=>line.support_item_name).join("; "),hours:lines.reduce((sum,line)=>sum+(line.unit==="Hour"?Number(line.quantity):0),0),rate:lines.length===1?Number(lines[0].unit_price):0,total,invoice_date:q("#smart-date").value,due_date:q("#smart-due").value,recipient_type:q("#smart-recipient-type").value,recipient_name:q("#smart-recipient-name").value.trim()||null,recipient_email:q("#smart-recipient-email").value.trim()||null,service_period_start:q("#smart-period-start").value||null,service_period_end:q("#smart-period-end").value||null,notes:q("#smart-notes").value.trim()||null,status:q("#smart-status").value,created_by:profile.id,updated_at:new Date().toISOString()};
  let invoiceId=currentInvoice?.id;
  if(invoiceId){
   const {error}=await db.from("invoices").update(payload).eq("id",invoiceId);
   if(error)throw error;
   const {error:linkDeleteError}=await db.from("invoice_shift_links").delete().eq("invoice_id",invoiceId);
   if(linkDeleteError)throw linkDeleteError;
   const {error:itemDeleteError}=await db.from("invoice_items").delete().eq("invoice_id",invoiceId);
   if(itemDeleteError)throw itemDeleteError;
  }else{
   const {data,error}=await db.from("invoices").insert(payload).select("id").single();
   if(error)throw error;
   invoiceId=data.id;
  }
  for(const line of lines){
   const {data:item,error}=await db.from("invoice_items").insert({invoice_id:invoiceId,organisation_id:organisationId,service_date:line.service_date,support_item_number:line.support_item_number,support_item_name:line.support_item_name,claim_type:line.claim_type||null,unit:line.unit,quantity:Number(line.quantity),unit_price:Number(line.unit_price),price_source:line.price_source||null,pricing_effective_from:line.pricing_effective_from||null}).select("id").single();
   if(error)throw error;
   if(line.shift_id){
    const {error:linkError}=await db.from("invoice_shift_links").insert({invoice_id:invoiceId,shift_id:line.shift_id,invoice_item_id:item.id,organisation_id:organisationId});
    if(linkError)throw linkError;
   }
  }
  toast("Invoice saved");
  q("#smart-invoice-editor").classList.add("hidden");
  await loadInvoices();
 }catch(error){toast(error.message||"Florence could not save the invoice")}
 finally{busy=false}
}

async function loadInvoices(){
 let currentContext;
 try{currentContext=await context()}catch(_error){return}
 const {db,organisationId}=currentContext;
 const {data,error}=await db.from("invoices").select("*,participant:participants(full_name,ndis_number)").eq("organisation_id",organisationId).order("invoice_date",{ascending:false});
 if(error){q("#smart-invoice-list").innerHTML=`<div class="empty">${esc(error.message)}</div>`;return}
 const list=data||[];
 const today=iso(new Date());
 const draft=list.filter(invoice=>invoice.status==="Draft").length;
 const overdue=list.filter(invoice=>invoice.status!=="Paid"&&invoice.due_date&&invoice.due_date<today).length;
 const outstanding=list.filter(invoice=>invoice.status!=="Paid").reduce((sum,invoice)=>sum+Number(invoice.total||0),0);
 q("#smart-invoice-summary").innerHTML=`<article><strong>${list.length}</strong><span>Total</span></article><article><strong>${draft}</strong><span>Draft</span></article><article><strong>${overdue}</strong><span>Overdue</span></article><article><strong>${money(outstanding)}</strong><span>Outstanding</span></article>`;
 q("#smart-invoice-list").innerHTML=list.length?list.map(invoice=>`<article class="record"><div class="record-top"><div><h3>${esc(invoice.invoice_number)}</h3><p>${esc(invoice.participant?.full_name||"No participant")} · ${esc(invoice.invoice_date)}</p></div><span class="badge ${invoice.status==="Paid"?"good":invoice.status==="Draft"?"amber":"purple"}">${esc(invoice.status)}</span></div><p><strong>${money(invoice.total)}</strong>${invoice.recipient_email?` · ${esc(invoice.recipient_email)}`:""}</p><div class="actions"><button class="secondary" data-open-invoice="${invoice.id}">Open</button>${invoice.status!=="Paid"?`<button class="link" data-paid-invoice="${invoice.id}">Mark paid</button>`:""}</div></article>`).join(""):'<div class="empty">No invoices yet.</div>';
 q("#smart-invoice-list").onclick=async event=>{
  let button=event.target.closest("[data-open-invoice]");
  if(button)return openEditor(list.find(invoice=>invoice.id===button.dataset.openInvoice));
  button=event.target.closest("[data-paid-invoice]");
  if(button){
   const {error:updateError}=await db.from("invoices").update({status:"Paid",paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",button.dataset.paidInvoice);
   if(updateError)return toast(updateError.message);
   toast("Invoice marked paid");
   return loadInvoices();
  }
 };
}

async function openTemplates(){
 try{
  await loadBase();
  q("#smart-template-panel").classList.remove("hidden");
  renderTemplates();
  q("#smart-template-panel").scrollIntoView({behavior:"smooth"});
 }catch(error){toast(error.message||"Florence could not load templates")}
}

function renderTemplates(){
 q("#smart-template-list").innerHTML=templates.length?templates.map(template=>`<article class="record"><div class="record-top"><div><h3>${esc(template.template_name)}</h3><p>${esc(template.support_item_number||"")} ${esc(template.support_item_name)}</p></div><strong>${money(template.unit_price)} / ${esc(template.unit)}</strong></div><p>${esc(template.shift_type||"Any shift")} · ${esc(template.day_category||"Any day")}</p><button class="link" data-delete-template="${template.id}">Deactivate</button></article>`).join(""):'<div class="empty">No additional service templates yet. Evelyn\'s eight agreement services are already ready to use.</div>';
 q("#smart-template-list").onclick=async event=>{
  const button=event.target.closest("[data-delete-template]");
  if(!button)return;
  const {db}=await context();
  const {error}=await db.from("invoice_service_templates").update({active:false,updated_at:new Date().toISOString()}).eq("id",button.dataset.deleteTemplate);
  if(error)return toast(error.message);
  await loadBase();
  renderTemplates();
 };
}

async function saveTemplate(){
 try{
  const {db,profile,organisationId}=await context();
  const {error}=await db.from("invoice_service_templates").insert({organisation_id:organisationId,template_name:q("#template-name").value.trim(),shift_type:q("#template-shift-type").value||null,day_category:q("#template-day").value||null,support_item_number:q("#template-code").value.trim()||null,support_item_name:q("#template-item-name").value.trim(),unit:q("#template-unit").value,unit_price:Number(q("#template-price").value),claim_type:q("#template-claim").value.trim()||null,recipient_name:q("#template-recipient-name").value.trim()||null,recipient_email:q("#template-recipient-email").value.trim()||null,price_source:"VJ approved service template",pricing_effective_from:q("#template-effective").value||null,pricing_review_date:q("#template-review").value||null,created_by:profile.id});
  if(error)throw error;
  q("#smart-template-form").reset();
  await loadBase();
  renderTemplates();
  toast("Service template saved");
 }catch(error){toast(error.message||"Florence could not save the template")}
}

function invoiceText(){
 const participant=q("#smart-participant")?.selectedOptions?.[0]?.textContent||"Participant";
 const lines=collectLines();
 return `Invoice ${q("#smart-number").value}\nParticipant: ${participant}\nService period: ${q("#smart-period-start").value||"Not set"} to ${q("#smart-period-end").value||"Not set"}\nInvoice date: ${q("#smart-date").value}\nDue date: ${q("#smart-due").value}\n\n${lines.map(line=>`${line.service_date} | ${line.support_item_number} ${line.support_item_name} | ${line.quantity} ${line.unit} x ${money(line.unit_price)} = ${money(Number(line.quantity)*Number(line.unit_price))}`).join("\n")}\n\nTotal: ${q("#smart-total").textContent}\n\n${q("#smart-notes").value||""}`;
}

function printInvoice(){
 const popup=open("","_blank");
 if(!popup)return toast("Allow pop-ups to print this invoice");
 popup.document.write(`<html><head><title>${esc(q("#smart-number").value)}</title><style>body{font-family:Arial;padding:32px;white-space:pre-wrap;line-height:1.5}h1{margin-bottom:24px}</style></head><body><h1>I-Care Connect</h1>${esc(invoiceText())}</body></html>`);
 popup.document.close();
 popup.focus();
 setTimeout(()=>popup.print(),250);
}

function prepareEmail(){
 const email=q("#smart-recipient-email").value.trim();
 if(!email)return toast("Add the confirmed recipient email before preparing the invoice email");
 const subject=`Invoice ${q("#smart-number").value} from I-Care Connect`;
 const body=`Hello ${q("#smart-recipient-name").value.trim()||""},\n\nPlease find the invoice details below. A PDF copy can be created using Print / save PDF in Florence.\n\n${invoiceText()}\n\nKind regards,\nI-Care Connect`;
 location.href=`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

window.FlorenceInvoicing={startEvelynService,openEditor};
window.addEventListener("florence:ready",install);
window.addEventListener("pageshow",()=>setTimeout(install,100));
let tries=0;
const timer=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(timer)},250);
})();
