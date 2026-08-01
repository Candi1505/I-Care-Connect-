(()=>{
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],KEY="florence-sil-v1";
document.documentElement.classList.add("sil-auth-pending");
let db=null,currentProfile=null;
const PROVIDER={legalName:"I-Care Connect PTY LTD",abn:"55 699 493 457",address:"1387 Amiens Rd, Amiens, QLD 4380",registrationGroup:"0138 — Assistance with Supported Independent Living",jurisdiction:"Queensland, Australia",keyManagementPersonnel:"Victoria Kussrow",seniorWorker:"Candice Long",reviewCycle:"At least annually, and earlier following legislative, service or risk changes",houseSafeguardingReview:"Every 6 months, after a significant incident, household change or environmental change",houseMeetingFrequency:"At least monthly and whenever a proposed change affects the home",recordRetention:"Retain in accordance with NDIS, privacy, incident and employment obligations",status:"Provider details pre-filled — verify registration and contact details before audit"};
const controlledDocuments=[
["Principal documents","📗","SIL Staff Handbook","Employee rights, responsibilities, conduct, incidents, safeguarding and SIL practice.",true],
["Principal documents","👩‍⚕️","Position Description — Disability Support Worker (SIL)","Role duties, qualifications, documentation and professional obligations.",true],
["Principal documents","🧭","Position Description — SIL Team Leader","Practice leadership, supervision, safeguarding oversight and quality responsibilities.",false],
["Principal documents","🤝","SIL Service Agreement","Current participant agreement template for I-Care Connect SIL services.",false],
["Governance and safeguarding","💬","SIL Supported Decision-Making Policy","Supporting genuine participant choice, communication and dignity of risk.",true],
["Governance and safeguarding","🛡️","SIL Safeguarding Policy","Recognising and responding to harm, conflict, neglect and exploitation.",true],
["Governance and safeguarding","🔐","SIL Practice Governance Policy","Workforce capability, supervision, evidence-informed practice and assurance.",true],
["Governance and safeguarding","📝","SIL Participant Agreement Explanation Record","Records accessible explanation and participant understanding of the SIL agreement.",false],
["Governance and safeguarding","🧡","SIL Participant Welcome and Rights Guide","Accessible introduction to rights, choices, complaints and safeguards.",true],
["SIL operations and worker tools","🗣️","SIL Participant Communication and Decision-Making Profile","Participant communication preferences and supported decision-making instructions.",true],
["SIL operations and worker tools","✅","SIL Worker Competency Checklist","Evidence-based competency assessment before unsupervised work and during refreshers.",true],
["SIL operations and worker tools","📌","SIL Participant-Specific Worker Instruction Form","Current authorised instructions required for safe, consistent participant support.",true],
["SIL operations and worker tools","🏡","SIL Worker House Induction Checklist","Property and participant-specific checks before an unsupervised shift.",true],
["SIL operations and worker tools","🎓","SIL Worker Training and Competency Register","Training currency, competency outcomes and refresher tracking.",false],
["SIL operations and worker tools","👀","SIL Practice Observation Checklist","Structured observation and development actions for frontline practice.",false],
["SIL operations and worker tools","🔄","SIL Shift Handover Form","Required factual handover information for outgoing and incoming workers.",true],
["SIL operations and worker tools","🌱","SIL Participant Choice and Daily Life Record","Records options, communication support and the participant’s own choice.",true],
["Participant records and service delivery","🚨","Participant Emergency Plan — SIL","Participant-specific emergency, evacuation and continuity arrangements.",true],
["Participant records and service delivery","⚠️","Participant Risk Assessment Form — SIL","Identifies participant risks, safeguards, controls and review actions.",true],
["Participant records and service delivery","📥","Participant Intake Form — SIL","Captures intake, consent, support needs and commencement information.",false],
["Participant records and service delivery","⚖️","Participant Rights and Responsibilities Policy","Rights, responsibilities, choice, dignity, privacy and complaint pathways.",true],
["Participant records and service delivery","📣","Incident Report Form","Factual reporting and escalation of incidents and reportable incidents.",true],
["Participant records and service delivery","💭","Feedback and Complaints Form","Accessible record for feedback, concerns and complaints.",true],
["Participant records and service delivery","🤲","Advocate or Support Person Request Form","Records a participant request for an advocate or support person.",true],
["Participant records and service delivery","🚪","Participant Exit and Transition Form","Plans safe, coordinated service exit or transition.",false],
["Participant records and service delivery","🧩","Participant Support Plan — SIL","Participant goals, preferences, routines and agreed supports.",true],
["Participant records and service delivery","🔏","Privacy Consent Form — Easy Read","Accessible consent choices for collecting, using and sharing information.",true],
["Participant records and service delivery","🔏","Privacy Consent Form","Consent choices for collecting, using and sharing participant information.",true],
["Participant records and service delivery","🗒️","Participant File Notes — SIL","Controlled participant file-note template.",true],
["Organisational compliance","🛑","Violence, Abuse, Neglect, Exploitation and Discrimination Policy","Prevention, identification, response and escalation obligations.",true],
["Organisational compliance","✍️","Worker Declarations","Worker acknowledgements, conflicts, conduct and compliance declarations.",true],
["Organisational compliance","⚖️","Conflict of Interest Policy","Identification, disclosure and management of actual or perceived conflicts.",true],
["Organisational compliance","🧭","Assessment and Provision of Supports Policy — SIL","Safe, suitable and participant-centred assessment and delivery of SIL supports.",true],
["Organisational compliance","📋","Worker Induction Checklist — SIL","Organisation-wide induction and compliance onboarding checklist.",true],
["Organisational compliance","🧼","Infection Prevention and Control Policy","Standard precautions, infection risks, outbreaks and worker responsibilities.",true],
["Organisational compliance","⛑️","Work Health and Safety Policy","Safe work practices, consultation, hazards and incident response.",true],
["Organisational compliance","🏢","Governance and Operational Management Policy","Governance, delegations, accountability and operational oversight.",false],
["Organisational compliance","👥","Human Resources Management Policy","Recruitment, screening, induction, supervision and workforce management.",false],
["Organisational compliance","📈","Continuous Improvement Policy","Improvement identification, action tracking and effectiveness review.",true],
["Organisational compliance","🔒","Privacy and Information Management Policy","Collection, access, storage, disclosure and breach response obligations.",true],
["Organisational compliance","💬","Feedback and Complaints Policy","Accessible, fair and non-retaliatory feedback and complaint management.",true],
["Organisational compliance","🌧️","Emergency and Disaster Management Policy","Preparedness, continuity, communication, response and recovery.",true],
["Organisational compliance","📊","Risk Management Policy","Organisation-wide identification, treatment and review of risk.",false],
["Organisational compliance","🚩","Incident Management Policy","Incident identification, response, investigation, notification and learning.",true]
];
let privateDocuments=new Map();
const schemas={
house:{title:"Add SIL support location",category:"SIL home",help:"Create the location where I-Care Connect delivers SIL supports. Housing, rent, tenancy and SDA management remain outside this workspace.",fields:[["name","Support location name / identifier"],["address","Support location address"],["emergency_contact","Property emergency contact","text",false],["bedrooms","Number of participant bedrooms","number",false],["support_model","Support model","select",["24-hour support","Sleepover","Active night","Drop-in / scheduled","Other"]],["emergency_plan","Emergency and continuity arrangements","textarea",false],["status","Status","select",["Active","Planned","Inactive"]]]},
safeguarding:{title:"SIL safeguarding assessment",category:"House safeguarding",help:"Assess participant-specific, environmental, visitor and worker-practice risks. High risks require immediate action.",fields:[["house","SIL support location"],["assessment_date","Assessment date","date"],["risk_level","Overall risk","select",["Low","Medium","High"]],["participant_risks","Participant-specific safeguarding risks","textarea"],["environmental_risks","Location and environmental risks","textarea"],["visitor_risks","Visitor or third-party risks","textarea",false],["worker_practice_risks","Worker-practice risks","textarea",false],["controls","Controls and safeguarding actions","textarea"],["responsible_person","Responsible person"],["next_review","Next review date","date"]]},
meeting:{title:"Participant consultation",category:"Consultation",help:"Record the participant’s own view and communication support. Changes to daily support must not be imposed without genuine consultation.",fields:[["house","SIL support location"],["meeting_date","Consultation date","datetime-local"],["participants","Participants consulted"],["communication_support","Communication supports used","textarea",false],["topics","Topics discussed","textarea"],["views","Participant views, including disagreement","textarea"],["decisions","Decisions made","textarea",false],["actions","Actions, owners and due dates","textarea",false],["facilitator","Facilitator"]]},
houseRules:{title:"Daily living and household consultation",category:"House governance",help:"Any support-related household arrangements must preserve the participant’s visitors, privacy, possessions and daily-choice rights.",fields:[["house","SIL support location"],["consultation_date","Consultation date","date"],["participants","Participants consulted"],["proposed_rules","Daily-living or household arrangements discussed","textarea"],["individual_views","Participant views","textarea"],["agreed_rules","Agreed support arrangements","textarea"],["unresolved_concerns","Unresolved concerns","textarea",false],["review_date","Review date","date"]]},
visitor:{title:"Visitor / contractor log",category:"Visitors",help:"This is a safeguarding and transparency record, not an approval register. Participants retain the right to invite visitors.",fields:[["house","SIL home"],["participant","Participant host / person affected","text",false],["visitor_name","Visitor or contractor name"],["visitor_type","Type","select",["Personal visitor","External support worker","Contractor","Volunteer","Health professional","Other"]],["arrival","Arrival","datetime-local"],["departure","Departure","datetime-local",false],["purpose","Purpose / work completed","textarea",false],["awareness","Participant awareness and consent confirmed","select",["Yes","Not applicable","Needs follow-up"]],["notes","Safeguarding or privacy notes","textarea",false]]},
communication:{title:"Communication & decision-making profile",category:"Participant profile",help:"Use the participant’s words and preferred communication. Record substituted decision-makers only where legally authorised.",fields:[["participant","Participant"],["preferred_communication","Preferred communication methods","textarea"],["understanding_support","How information should be explained","textarea"],["decision_support","Support needed to make decisions","textarea"],["trusted_people","Trusted supporters / advocates","textarea",false],["authorised_decision_maker","Legally authorised decision-maker and scope","textarea",false],["do_not_assume","Things workers must not assume","textarea",false],["review_date","Review date","date"]]},
instructions:{title:"Participant-specific worker instructions",category:"Participant instructions",help:"Record only current, authorised instructions needed for safe and consistent support.",fields:[["participant","Participant"],["house","SIL home"],["routines","Preferred routines and daily choices","textarea"],["personal_care","Personal-care preferences","textarea",false],["meals","Meal and food preferences","textarea",false],["community","Community and relationship supports","textarea",false],["health_safety","Health and safety instructions","textarea",false],["behaviour_support","Behaviour Support Plan / restrictive-practice alerts","textarea",false],["privacy","Privacy, visitors and private-space preferences","textarea",false],["review_date","Review date","date"]]},
choice:{title:"Participant choice & daily life record",category:"Supported decision-making",help:"Evidence the options, communication support and participant’s own choice. Do not use this to seek provider permission for ordinary life decisions.",fields:[["participant","Participant"],["house","SIL home","text",false],["date","Date and time","datetime-local"],["decision","Decision being made"],["options","Options explained","textarea"],["support","Communication / decision support provided","textarea",false],["choice","Participant’s choice","textarea"],["risk","Identified risk and dignity-of-risk response","textarea",false],["outcome","Outcome / follow-up","textarea",false],["worker","Worker recording"]]},
agreementExplanation:{title:"SIL agreement explanation record",category:"Participant agreement",help:"Record how the SIL service agreement was explained in an accessible way, including that I-Care Connect delivers supports and is not the participant’s housing provider.",fields:[["participant","Participant"],["date","Explanation date","date"],["documents","Document explained","select",["SIL Service Agreement"]],["format","Accessible format / communication support","textarea"],["separation_explained","How the separation between housing and SIL support was explained","textarea"],["rights_understood","Participant’s questions and demonstrated understanding","textarea"],["support_person","Support person / advocate present","text",false],["confirmation","Participant confirmation / signature status","select",["Signed","Verbal confirmation recorded","Awaiting signature","Further explanation required"]]]},
serviceAgreement:{title:"SIL service agreement register",category:"Participant agreement",help:"This register does not replace the signed agreement. Attach the executed agreement in Florence’s Compliance Centre.",fields:[["participant","Participant"],["commencement","Commencement date","date"],["review_date","Review date","date"],["signed_status","Status","select",["Draft","Provided for review","Signed","Expired / replaced"]],["support_scope","Agreed SIL support scope","textarea"],["fees_reference","Pricing / schedule reference","textarea",false],["termination_terms","Termination / change arrangements confirmed","textarea",false],["document_location","Signed document location or reference","text",false]]},
rights:{title:"Welcome & rights acknowledgement",category:"Participant rights",help:"Record provision of rights information in a form the participant can understand.",fields:[["participant","Participant"],["date","Date provided","date"],["format","Format / communication method"],["topics","Rights explained","textarea"],["advocacy","Advocacy and complaint options explained","textarea"],["questions","Questions / concerns raised","textarea",false],["acknowledgement","Acknowledgement status","select",["Signed","Verbal acknowledgement","Further support required"]]]},
privateSpace:{title:"Visitor & private-space preferences",category:"Participant rights",help:"A participant’s SIL home is their home. Preferences support privacy and safeguarding; they are not provider permission conditions.",fields:[["participant","Participant"],["house","SIL support location"],["visitor_preferences","Visitor preferences","textarea"],["private_space","Private-space and room-access preferences","textarea"],["keys_possessions","Keys and possessions arrangements","textarea",false],["relationships","Relationship and privacy supports","textarea",false],["review_date","Review date","date"]]},
handover:{title:"SIL shift handover",category:"Shift handover",help:"Complete at the end of every shift. Record facts and direct observations, not assumptions.",fields:[["house","SIL home"],["shift_date","Shift date","date"],["shift_start","Shift start","time",false],["shift_end","Shift end","time",false],["outgoing_worker","Outgoing worker"],["incoming_worker","Incoming worker"],["wellbeing","Participant wellbeing and significant observations","textarea"],["daily_support","Meals, personal care, activities and choices","textarea",false],["medication","Medication matters","textarea",false],["incidents","Incidents, behaviours or safeguarding concerns","textarea",false],["appointments","Appointments / upcoming activities","textarea",false],["household","Household, maintenance and visitor matters","textarea",false],["actions","Outstanding actions","textarea",false],["incoming_acknowledged","Incoming worker acknowledgement","select",["Acknowledged","Awaiting acknowledgement"]]]},
induction:{title:"SIL worker house induction",category:"Worker induction",help:"Must be completed before the worker’s first shift at the property and repeated after material changes.",fields:[["worker","Worker"],["house","SIL home"],["date","Induction date","date"],["participants_reviewed","Participant profiles and instructions reviewed","select",["Yes","Partly — follow-up required","No"]],["emergency_reviewed","Emergency and continuity arrangements reviewed","select",["Yes","No"]],["safeguarding_reviewed","Safeguarding and house risks reviewed","select",["Yes","No"]],["medication_reviewed","Medication arrangements reviewed","select",["Yes","Not applicable","No"]],["house_practice","House routines, privacy and visitor rights reviewed","select",["Yes","No"]],["gaps","Gaps / supervised practice required","textarea",false],["supervisor","Supervisor / Team Leader"]]},
competency:{title:"SIL worker competency",category:"Worker competency",help:"Competency should be assessed, not assumed from attendance alone.",fields:[["worker","Worker"],["assessment_date","Assessment date","date"],["assessor","Assessor"],["area","Competency area","select",["Participant rights and choice","Supported decision-making","Active support","Safeguarding","Medication","Incident response","Documentation and handover","Positive behaviour support","Emergency response","SIL overall practice"]],["method","Assessment method","select",["Observed practice","Knowledge questions","Scenario assessment","Document review","Combined assessment"]],["outcome","Outcome","select",["Competent","Competent with development actions","Not yet competent"]],["evidence","Evidence and observations","textarea"],["actions","Development / supervision actions","textarea",false],["refresher_due","Refresher due","date",false]]},
training:{title:"SIL training register entry",category:"Worker training",help:"Training attendance and competency are separate. Record assessment outcome where applicable.",fields:[["worker","Worker"],["topic","Training topic"],["completed","Completion date","date"],["method","Delivery method"],["trainer","Trainer / provider"],["outcome","Competency outcome","select",["Completed — competency verified","Completed — assessment pending","Further training required"]],["refresher_due","Refresher due","date",false],["notes","Notes","textarea",false]]},
observation:{title:"SIL practice observation",category:"Practice observation",help:"Use factual observations and discuss findings with the worker.",fields:[["worker","Worker"],["house","SIL home"],["date","Observation date","date"],["observer","Observer"],["areas","Practice areas observed","textarea"],["strengths","Strengths observed","textarea"],["concerns","Concerns / non-conformities","textarea",false],["participant_rights","Participant rights, dignity and choice findings","textarea"],["actions","Actions, owner and due date","textarea",false],["outcome","Outcome","select",["Satisfactory","Development actions","Immediate escalation required"]]]},
provider:{title:"Edit provider profile",category:"Provider governance",help:"Verify these details against current registration and corporate records before an audit.",fields:[["legalName","Legal name"],["abn","ABN"],["address","Business address"],["registrationGroup","SIL registration group"],["keyManagementPersonnel","Key Management Personnel"],["seniorWorker","Senior worker / operational contact","text",false],["reviewCycle","Policy review cycle"],["status","Verification status","textarea"]]}
};
let state=load(),activeTab="dashboard";
function load(){try{return JSON.parse(localStorage.getItem(KEY))||{provider:PROVIDER,records:[]}}catch{return{provider:PROVIDER,records:[]}}}
function save(){localStorage.setItem(KEY,JSON.stringify(state));render();toast("SIL record saved")}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function toast(t){const e=$("#sil-toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2400)}
function uid(){return crypto.randomUUID?.()||Date.now()+"-"+Math.random().toString(16).slice(2)}
function statusOf(r){if(r.status)return r.status;if(r.fields?.next_review&&new Date(r.fields.next_review)<new Date())return"Overdue";const vals=Object.values(r.fields||{});return vals.some(v=>/to be completed|needs confirmation|awaiting/i.test(String(v)))?"Needs confirmation":"Complete"}
function badge(s){const c=/overdue|not yet|high|immediate/i.test(s)?"red":/draft|pending|needs|awaiting|medium/i.test(s)?"amber":"good";return`<span class="badge ${c}">${esc(s)}</span>`}
function fmt(v){if(!v)return"";const d=new Date(v);return isNaN(d)?v:new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric",hour:v.includes?.("T")?"numeric":undefined,minute:v.includes?.("T")?"2-digit":undefined}).format(d)}
function fieldHtml(f){const [name,label,type="text",opts=[],required=true]=f,req=required?" required":"",hint=required?"":" <small>(optional)</small>";if(type==="textarea")return`<label>${label}${hint}<textarea name="${name}"${req}></textarea></label>`;if(type==="select")return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select…</option>${opts.map(o=>`<option>${esc(o)}</option>`).join("")}</select></label>`;return`<label>${label}${hint}<input name="${name}" type="${type}"${req}></label>`}
function openForm(type){const s=schemas[type];if(!s)return;$("#sil-dialog-title").textContent=s.title;$("#sil-dialog-help").innerHTML=`${esc(s.help)}<div class="sil-required-note">Fields without “optional” must be completed before saving.</div>`;$("#sil-dialog-fields").innerHTML=s.fields.map(fieldHtml).join("");$("#sil-form").dataset.type=type;const d=$("#sil-dialog");d.showModal?d.showModal():d.setAttribute("open","")}
function closeForm(){const d=$("#sil-dialog");d.close?d.close():d.removeAttribute("open")}
function submit(e){e.preventDefault();const type=e.currentTarget.dataset.type,s=schemas[type],data=Object.fromEntries(new FormData(e.currentTarget));if(type==="provider"){state.provider={...state.provider,...data};save();closeForm();return}state.records.unshift({id:uid(),type,category:s.category,title:s.title,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),fields:data,status:/Draft|Pending|Awaiting|Needs/.test(Object.values(data).join(" "))?"Needs confirmation":"Complete"});save();e.currentTarget.reset();closeForm()}
function recordCard(r){const entries=Object.entries(r.fields||{}).filter(([,v])=>v).slice(0,5),risk=r.fields?.risk_level?` sil-risk-${r.fields.risk_level.toLowerCase()}`:"";return`<article class="record${risk}"><div class="record-top"><div><h3>${esc(r.title)}</h3><p>${esc(r.category)} · ${fmt(r.createdAt)}</p></div>${badge(statusOf(r))}</div><p>${entries.map(([k,v])=>`<strong>${esc(k.replaceAll("_"," "))}:</strong> ${esc(v)}`).join("<br>")}</p><div class="sil-record-actions"><button class="link" data-delete="${r.id}">Delete</button></div></article>`}
function render(){const recs=state.records||[],complete=recs.filter(r=>statusOf(r)==="Complete").length,needs=recs.length-complete,houses=recs.filter(r=>r.category==="SIL home").length;
$("#sil-stats").innerHTML=`<div class="stat"><strong>${houses}</strong><span>Support locations</span></div><div class="stat"><strong>${recs.length}</strong><span>SIL records</span></div><div class="stat"><strong>${complete}</strong><span>Complete</span></div><div class="stat"><strong>${needs}</strong><span>Need attention</span></div>`;
$("#sil-storage-status").textContent="● Records ready";
const outstanding=recs.filter(r=>statusOf(r)!=="Complete");$("#sil-outstanding").innerHTML=outstanding.slice(0,8).map(recordCard).join("")||'<div class="sil-empty">No outstanding SIL records yet. New participant-specific records remain incomplete until confirmed.</div>';
const counts={};recs.forEach(r=>counts[r.category]=(counts[r.category]||0)+1);$("#sil-category-summary").innerHTML=Object.entries(counts).map(([k,v])=>`<article class="record"><div class="record-top"><div><h3>${esc(k)}</h3><p>${v} record${v===1?"":"s"}</p></div></div></article>`).join("")||'<div class="sil-empty">No records have been entered.</div>';
$("#sil-house-list").innerHTML=recs.filter(r=>["SIL home","House safeguarding","Consultation","House governance","Visitors"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">Add the first SIL support location to begin the service file.</div>';
$("#sil-participant-list").innerHTML=recs.filter(r=>["Participant profile","Participant instructions","Supported decision-making","Participant agreement","Participant rights"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">Participant SIL records will appear here.</div>';
$("#sil-shift-list").innerHTML=recs.filter(r=>["Shift handover","Supported decision-making","Visitors"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">No SIL shift records.</div>';
$("#sil-worker-list").innerHTML=recs.filter(r=>["Worker induction","Worker competency","Worker training","Practice observation"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">No SIL workforce records.</div>';
renderProvider();renderTemplates();renderResources();renderEvidence();
}
function renderProvider(){const p=state.provider||PROVIDER;$("#sil-provider-profile").innerHTML=`<div class="sil-provider-grid">${Object.entries(p).map(([k,v])=>`<div class="sil-provider-item"><small>${esc(k.replace(/([A-Z])/g," $1"))}</small><strong>${esc(v)}</strong></div>`).join("")}</div>`}
async function loadPrivateDocuments(){
 const {data,error}=await db.from("compliance_documents")
  .select("id,title,storage_path,original_filename,uploaded_at")
  .eq("organisation_id",currentProfile.organisation_id)
  .eq("category","Controlled library")
  .order("title");
 if(error)throw error;
 privateDocuments=new Map((data||[]).map(document=>[document.title,document]));
}
function resourceCard([,icon,title,description]){
 const document=privateDocuments.get(title);
 const control=document
  ?`<button type="button" class="secondary" data-open-private-document="${document.id}">Open private PDF</button>`
  :`<button type="button" class="secondary" disabled>Private PDF pending</button>`;
 return`<article class="sil-resource-card"><span aria-hidden="true">${icon}</span><div><strong>${esc(title)}</strong><p>${esc(description)}</p></div>${control}</article>`;
}
function documentGroups(documents){return[...new Set(documents.map(document=>document[0]))].map(category=>`<section class="sil-document-group"><h4>${esc(category)}</h4><div class="stack">${documents.filter(document=>document[0]===category).map(resourceCard).join("")}</div></section>`).join("")}
function renderLibraryStatus(){
 const count=privateDocuments.size,total=controlledDocuments.length,complete=count===total;
 const status=$("#sil-library-status");
 if(status)status.innerHTML=`<strong>${complete?"Private Florence library ready":`${count} of ${total} private PDFs available`}</strong><br>${complete?"These documents open from I-Care Connect’s private Supabase Storage. Florence does not use the Google Drive links.":"A supervisor must import the approved private-library ZIP before workers use these documents."}`;
 const migration=$("#sil-library-import-status");
 if(migration&&!migration.dataset.progress)migration.textContent=complete?"All 44 private PDF copies are installed.":`${count} of ${total} documents are installed.`;
}
function renderTemplates(){
 $("#sil-template-register").innerHTML=currentProfile?.role==="supervisor"?documentGroups(controlledDocuments):"";
 renderLibraryStatus();
}
function renderResources(){
 const workerDocuments=controlledDocuments.filter(document=>document[4]);
 $("#sil-worker-resources").innerHTML=documentGroups(workerDocuments);
 const supervisor=currentProfile?.role==="supervisor";
 $("#sil-supervisor-resource-panel").classList.toggle("hidden",!supervisor);
 $("#sil-supervisor-resources").innerHTML=supervisor?documentGroups(controlledDocuments):"";
 renderLibraryStatus();
}
async function openPrivateDocument(recordId){
 try{
  const document=[...privateDocuments.values()].find(item=>item.id===recordId);
  if(!document)throw new Error("The private document record is not available");
  await db.rpc("record_access_event",{p_action:"DOWNLOAD",p_table_name:"controlled_library",p_record_id:document.id,p_metadata:{title:document.title}}).catch(()=>{});
  const bucket=window.FLORENCE_CONFIG.storageBucket;
  const {data,error}=await db.storage.from(bucket).createSignedUrl(document.storage_path,120);
  if(error||!data?.signedUrl)throw error||new Error("Florence could not create the private document link");
  window.open(data.signedUrl,"_blank","noopener,noreferrer");
 }catch(error){toast(error.message||"Florence could not open that private document")}
}
async function sha256Hex(buffer){
 const digest=await crypto.subtle.digest("SHA-256",buffer);
 return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
}
async function importPrivateLibrary(file){
 if(currentProfile?.role!=="supervisor")throw new Error("Only a supervisor can install the controlled library");
 if(!file)throw new Error("Choose the Florence private-library ZIP");
 if(!window.JSZip)throw new Error("The secure ZIP importer did not load. Refresh Florence and try again.");
 const button=$("#sil-import-library"),status=$("#sil-library-import-status");
 button.disabled=true;
 status.dataset.progress="true";
 try{
  status.textContent="Opening the controlled-library ZIP…";
  const archive=await JSZip.loadAsync(file);
  const manifestFile=archive.file("manifest.json");
  if(!manifestFile)throw new Error("This ZIP does not contain Florence’s manifest.json");
  const manifest=JSON.parse(await manifestFile.async("text"));
  if(manifest.format!=="florence-controlled-library"||manifest.version!==1||manifest.document_count!==44||!Array.isArray(manifest.documents)||manifest.documents.length!==44)throw new Error("This is not the approved 44-document Florence private-library ZIP");
  const approvedTitles=new Set(controlledDocuments.map(document=>document[2]));
  const bucket=window.FLORENCE_CONFIG.storageBucket;
  for(let index=0;index<manifest.documents.length;index++){
   const document=manifest.documents[index];
   if(!approvedTitles.has(document.title))throw new Error(`Unexpected document in ZIP: ${document.title}`);
   const entry=archive.file(document.filename);
   if(!entry)throw new Error(`Missing PDF in ZIP: ${document.filename}`);
   status.textContent=`Installing private PDF ${index+1} of ${manifest.documents.length}: ${document.title}`;
   const bytes=await entry.async("arraybuffer");
   if(document.sha256&&await sha256Hex(bytes)!==document.sha256)throw new Error(`Integrity check failed for ${document.title}`);
   const storagePath=`${currentProfile.organisation_id}/controlled-library/${document.filename}`;
   const blob=new Blob([bytes],{type:"application/pdf"});
   const {error:uploadError}=await db.storage.from(bucket).upload(storagePath,blob,{contentType:"application/pdf",upsert:true});
   if(uploadError)throw uploadError;
   const payload={organisation_id:currentProfile.organisation_id,scope:"Organisation",subject_type:"organisation",subject_name:"I-Care Connect",category:"Controlled library",title:document.title,storage_path:storagePath,original_filename:document.filename,mime_type:"application/pdf",version:1,uploaded_by:currentProfile.id,uploaded_at:new Date().toISOString()};
   const {data:existing,error:lookupError}=await db.from("compliance_documents").select("id").eq("organisation_id",currentProfile.organisation_id).eq("category","Controlled library").eq("title",document.title).maybeSingle();
   if(lookupError)throw lookupError;
   const result=existing
    ?await db.from("compliance_documents").update(payload).eq("id",existing.id)
    :await db.from("compliance_documents").insert(payload);
   if(result.error)throw result.error;
  }
  await loadPrivateDocuments();
  renderTemplates();renderResources();
  status.textContent="Success — all 44 documents are private Florence PDF copies. Google Drive is no longer used by the app.";
  toast("Private controlled library installed")
 }finally{
  button.disabled=false;
  delete status.dataset.progress;
  $("#sil-library-zip").value="";
 }
}
function renderEvidence(){const cat=$("#sil-filter-category"),current=cat.value,cats=[...new Set(state.records.map(r=>r.category))].sort();cat.innerHTML='<option value="all">All categories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");cat.value=cats.includes(current)?current:"all";const q=$("#sil-filter-search").value.toLowerCase(),st=$("#sil-filter-status").value,ca=cat.value;const rows=state.records.filter(r=>(ca==="all"||r.category===ca)&&(st==="all"||statusOf(r)===st)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));$("#sil-evidence-list").innerHTML=rows.map(recordCard).join("")||'<div class="sil-empty">No matching evidence records.</div>'}
function exportFile(kind){const rows=state.records.map(r=>({id:r.id,category:r.category,title:r.title,status:statusOf(r),created_at:r.createdAt,...r.fields}));let blob,name;if(kind==="json"){blob=new Blob([JSON.stringify({provider:state.provider,records:rows,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});name="Florence-SIL-audit-evidence.json"}else{const keys=[...new Set(rows.flatMap(Object.keys))],csv=[keys.join(","),...rows.map(r=>keys.map(k=>'"'+String(r[k]??"").replaceAll('"','""')+'"').join(","))].join("\n");blob=new Blob([csv],{type:"text/csv"});name="Florence-SIL-audit-evidence.csv"}const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}
$$('[data-sil-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.silTab;$$('[data-sil-tab]').forEach(x=>x.classList.toggle("active",x===b));$$('.sil-panel').forEach(x=>x.classList.toggle("active",x.id===`sil-${activeTab}-panel`));if(activeTab==="evidence")renderEvidence()});
$$('[data-open-form]').forEach(b=>b.onclick=()=>openForm(b.dataset.openForm));$("#edit-provider").onclick=()=>{openForm("provider");setTimeout(()=>Object.entries(state.provider||PROVIDER).forEach(([k,v])=>{const e=$(`[name="${k}"]`);if(e)e.value=v}),0)};$("#sil-form").onsubmit=submit;$("#sil-dialog-close").onclick=closeForm;$("#sil-dialog-cancel").onclick=closeForm;$("#sil-refresh").onclick=async()=>{state=load();await loadPrivateDocuments();render();toast("SIL workspace refreshed")};$("#sil-import-library")?.addEventListener("click",()=>$("#sil-library-zip")?.click());$("#sil-library-zip")?.addEventListener("change",event=>{const file=event.target.files?.[0];if(file)void importPrivateLibrary(file).catch(error=>{const status=$("#sil-library-import-status");if(status)status.textContent=error.message||"The private library could not be installed";toast(error.message||"The private library could not be installed")})});$("#sil-export-json").onclick=()=>exportFile("json");$("#sil-export-csv").onclick=()=>exportFile("csv");["#sil-filter-category","#sil-filter-status","#sil-filter-search"].forEach(s=>$(s).addEventListener(s.includes("search")?"input":"change",renderEvidence));document.addEventListener("click",e=>{const privateButton=e.target.closest("[data-open-private-document]");if(privateButton){void openPrivateDocument(privateButton.dataset.openPrivateDocument);return}const b=e.target.closest("[data-delete]");if(!b)return;if(confirm("Delete this SIL record?")){state.records=state.records.filter(r=>r.id!==b.dataset.delete);save()}});
async function authorise(){
 try{
  if(!window.supabase||!window.FLORENCE_CONFIG?.supabaseUrl||!window.FLORENCE_CONFIG?.supabaseAnonKey)throw new Error("Florence configuration is unavailable.");
  db=window.supabase.createClient(window.FLORENCE_CONFIG.supabaseUrl,window.FLORENCE_CONFIG.supabaseAnonKey);
  const {data:{session}}=await db.auth.getSession();
  if(!session){location.replace("index.html");return}
  const {data,error}=await db.from("profiles").select("id,role,active,organisation_id").eq("id",session.user.id).single();
  if(error||!data?.active||!["staff","supervisor"].includes(data.role)){location.replace("index.html");return}
  currentProfile=data;
  const supervisor=data.role==="supervisor";
  $('[data-sil-tab="provider"]')?.classList.toggle("hidden",!supervisor);
  $("#sil-provider-panel")?.classList.toggle("hidden",!supervisor);
  $("#sil-library-import-panel")?.classList.toggle("hidden",!supervisor);
  await loadPrivateDocuments();
  render();
  document.documentElement.classList.remove("sil-auth-pending");
 }catch(error){
  console.error("SIL access check failed",error);
  location.replace("index.html");
 }
}
authorise();
})();
