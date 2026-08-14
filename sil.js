(()=>{
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
document.documentElement.classList.add("sil-auth-pending");
let db=null,currentProfile=null;
let directory={participants:[],staff:[],shifts:[]};
const DOMESTIC_TASKS=[
 ["Kitchen",[
  ["kitchen_benches","Benches and accessible surfaces wiped"],
  ["kitchen_sink","Sink and taps cleaned"],
  ["kitchen_cooktop","Cooktop and splashback cleaned"],
  ["kitchen_appliances","Appliance exteriors wiped"],
  ["kitchen_microwave","Microwave cleaned inside and out"],
  ["kitchen_fridge","Fridge spills and expired food checked"],
  ["kitchen_cupboards","Cupboard fronts and high-touch surfaces wiped"],
  ["kitchen_dishes","Dishes washed or dishwasher managed"],
  ["kitchen_floor_dry","Floor swept or vacuumed"],
  ["kitchen_floor_mop","Hard floor mopped"],
  ["kitchen_bins","Bins emptied and liners replaced"]
 ]],
 ["Bathroom and toilet",[
  ["bathroom_toilet","Toilet cleaned and disinfected"],
  ["bathroom_basin","Basin and taps cleaned"],
  ["bathroom_shower","Shower or bath cleaned"],
  ["bathroom_mirror","Mirrors cleaned"],
  ["bathroom_floor","Floor vacuumed or mopped"],
  ["bathroom_bins","Bins emptied"],
  ["bathroom_supplies","Agreed toiletries and supplies replenished"]
 ]],
 ["Living and shared areas",[
  ["living_dust","Accessible surfaces dusted"],
  ["living_touchpoints","High-touch points wiped"],
  ["living_tidy","Area tidied while respecting personal possessions"],
  ["living_vacuum","Carpets and rugs vacuumed"],
  ["living_mop","Hard floors mopped"],
  ["living_windows","Accessible windows and internal glass cleaned as scheduled"],
  ["living_entry","Entry and door area cleaned"]
 ]],
 ["Bedroom or private space — only with participant consent",[
  ["bedroom_consent","Participant consent or agreed access confirmed"],
  ["bedroom_linen","Bed linen changed as agreed"],
  ["bedroom_dust","Accessible surfaces dusted"],
  ["bedroom_floor","Floor vacuumed or mopped"],
  ["bedroom_bin","Bin emptied"]
 ]],
 ["Laundry",[
  ["laundry_wash","Washing completed as agreed"],
  ["laundry_dry","Drying completed as agreed"],
  ["laundry_fold","Clothing and linen folded"],
  ["laundry_putaway","Items put away as agreed"],
  ["laundry_area","Laundry area cleaned"],
  ["laundry_lint","Dryer lint filter checked and cleaned"]
 ]],
 ["Safety and final check",[
  ["safety_chemicals","Cleaning chemicals safely stored"],
  ["safety_equipment","Equipment cleaned and stored"],
  ["safety_hazards","Slip, trip and other hazards checked"],
  ["safety_maintenance","Maintenance issues checked and recorded below"],
  ["safety_walkthrough","Final walk-through completed"]
 ]]
];
const participantRecordTypes=new Set(["visitor","supportPlan","emergencyPlan","riskAssessment","intake","communication","instructions","choice","agreementExplanation","serviceAgreement","rights","privateSpace","handover","domesticChecklist"]);
const workerRecordTypes=new Set(["induction","competency","training","observation"]);
const workerCreateRecordTypes=new Set(["visitor","choice","handover","domesticChecklist"]);
function redirectThroughFlorence(reason=""){
 try{sessionStorage.setItem("florence:return-to","sil")}catch(_ignored){}
 const target=new URL("index.html",location.href);
 target.searchParams.set("return","sil");
 if(reason)target.searchParams.set("reason",reason);
 location.replace(target.toString());
}
function showSilStartupError(error){
 const message=String(error?.message||error||"Florence could not open the SIL workspace").slice(0,800);
 document.documentElement.classList.remove("sil-auth-pending");
 document.body.innerHTML=`<main class="sil-main"><article class="panel sil-startup-error"><p class="eyebrow">Florence SIL</p><h1>The SIL workspace could not open</h1><p>Florence kept you signed in and stopped the silent redirect so the problem can be corrected safely.</p><pre id="sil-startup-error-detail"></pre><div class="actions"><button id="sil-startup-retry" type="button" class="primary">Try again</button><button id="sil-startup-home" type="button" class="secondary">Return to Florence Home</button></div></article></main>`;
 const detail=document.querySelector("#sil-startup-error-detail");
 if(detail)detail.textContent=message;
 document.querySelector("#sil-startup-retry")?.addEventListener("click",()=>location.reload());
 document.querySelector("#sil-startup-home")?.addEventListener("click",()=>location.replace("index.html"));
}
async function auditSilAccess(action,tableName,recordId=null,metadata={}){
 try{
  const {error}=await db.rpc("record_access_event",{p_action:action,p_table_name:tableName,p_record_id:recordId,p_metadata:metadata});
  if(error)console.warn("Florence SIL audit event failed",error.message||error);
 }catch(error){console.warn("Florence SIL audit event failed",error)}
}
const PROVIDER={legalName:"I-Care Connect PTY LTD",abn:"55 699 493 457",address:"1387 Amiens Rd, Amiens, QLD 4380",registrationGroup:"0138 — Assistance with Supported Independent Living",jurisdiction:"Queensland, Australia",keyManagementPersonnel:"Victoria Kussrow",seniorWorker:"Candice Long",reviewCycle:"At least annually, and earlier following legislative, service or risk changes",houseSafeguardingReview:"Every 6 months, after a significant incident, household change or environmental change",houseMeetingFrequency:"At least monthly and whenever a proposed change affects the home",recordRetention:"Retain in accordance with NDIS, privacy, incident and employment obligations",status:"Provider details pre-filled — verify registration and contact details before audit"};
const AUDIT_CATALOGUE=window.FLORENCE_AUDIT_CATALOGUE;
if(!AUDIT_CATALOGUE)throw new Error("Florence audit document catalogue did not load");
const controlledDocuments=AUDIT_CATALOGUE.documents;
let privateDocuments=new Map(),evidenceChecks=new Map(),pendingControlledUpload=null,pendingParticipantTemplate=null;
const participantTemplateKeys=new Set(["core-participant-intake","core-incident-form","core-feedback-form","core-medication-consent","core-mealtime-checklist","core-mealtime-plan","core-medication-plan","core-home-risk","core-satisfaction-survey","core-service-agreement","core-risk-indemnity","core-money-declaration","core-privacy-consent","core-privacy-consent-easy","core-participant-risk","core-participant-emergency-plan","core-support-plan","core-exit-transition","core-advocate-request","sil-cotenant-review","sil-choice-record","sil-participant-instructions","sil-agreement-explanation","sil-service-agreement","sil-welcome-rights","sil-communication-profile"]);
const schemas={
house:{title:"Add SIL support location",category:"SIL home",help:"Create the location where I-Care Connect delivers SIL supports. Housing, rent, tenancy and SDA management remain outside this workspace.",fields:[["name","Support location name / identifier"],["address","Support location address"],["emergency_contact","Property emergency contact","text",false],["bedrooms","Number of participant bedrooms","number",false],["support_model","Support model","select",["24-hour support","Sleepover","Active night","Drop-in / scheduled","Other"]],["emergency_plan","Emergency and continuity arrangements","textarea",false],["status","Status","select",["Active","Planned","Inactive"]]]},
safeguarding:{title:"SIL safeguarding assessment",category:"House safeguarding",help:"Assess participant-specific, environmental, visitor and worker-practice risks. High risks require immediate action.",fields:[["house","SIL support location"],["assessment_date","Assessment date","date"],["risk_level","Overall risk","select",["Low","Medium","High"]],["participant_risks","Participant-specific safeguarding risks","textarea"],["environmental_risks","Location and environmental risks","textarea"],["visitor_risks","Visitor or third-party risks","textarea",false],["worker_practice_risks","Worker-practice risks","textarea",false],["controls","Controls and safeguarding actions","textarea"],["responsible_person","Responsible person"],["next_review","Next review date","date"]]},
 meeting:{title:"House meeting & participant consultation",category:"Consultation",help:"Hold at least monthly and whenever a proposed change affects the home. Record each participant’s own words. Use a separate participant record where a view is private or materially different.",fields:[["meeting_details","Meeting details","section"],["house","SIL support location"],["meeting_date","Meeting date and time","datetime-local"],["meeting_type","Meeting type","select",["Shared house meeting","Individual consultation","Co-tenant or vacancy consultation","Post-incident consultation","Change consultation"]],["facilitator","Facilitator"],["attendance","Participation and views","section"],["participants","Participants attending"],["non_attendees","People not attending and how their views were obtained","textarea",false],["communication_support","Communication, interpreter, advocate or support used","textarea",false],["discussion","Discussion and decisions","section"],["topics","Topics discussed","textarea"],["views","Each participant’s views in their own words, including disagreement","textarea"],["decisions","Agreed decisions — or why no decision was reached","textarea"],["actions","Actions, owner, due date and status","textarea",false],["escalation","Incident, complaint, support-plan update or improvement required","textarea",false],["next_meeting","Next meeting date","date"],["confirmation","Participant confirmation","select",["Participants confirmed this record","Confirmation to be obtained","Separate/private record required"]]]},
 houseRules:{title:"House rules & shared-space consultation",category:"House governance",help:"House arrangements must be genuinely agreed with every resident and must not remove rights to visitors, privacy, possessions or ordinary daily choices.",fields:[["consultation_details","Consultation details","section"],["house","SIL support location"],["consultation_date","Consultation date","date"],["participants","Residents consulted"],["communication_support","Communication support used","textarea",false],["consultation","Resident views","section"],["topics","Areas discussed — kitchen, lounge, laundry, chores, visitors, noise, smoking, pets, shared costs, transport and conflict","textarea"],["individual_views","Each resident’s view in their own words","textarea"],["response","Consultation outcome","select",["Agreed","Changes requested","Objected","Decision deferred"]],["agreed_rules","Exact plain-language arrangements agreed","textarea"],["unresolved_concerns","Unresolved concerns and escalation","textarea",false],["accessible_copy","How an accessible copy was provided","textarea"],["review_date","Review date","date"]]},
visitor:{title:"Visitor / contractor log",category:"Visitors",help:"This is a safeguarding and transparency record, not an approval register. Participants retain the right to invite visitors.",fields:[["house","SIL home"],["participant","Participant"],["visitor_name","Visitor or contractor name"],["visitor_type","Type","select",["Personal visitor","External support worker","Contractor","Volunteer","Health professional","Other"]],["arrival","Arrival","datetime-local"],["departure","Departure","datetime-local",false],["purpose","Purpose / work completed","textarea",false],["awareness","Participant awareness and consent confirmed","select",["Yes","Not applicable","Needs follow-up"]],["notes","Safeguarding or privacy notes","textarea",false]]},
 supportPlan:{title:"Participant support plan",category:"Participant service delivery",help:"Create this collaboratively before support begins. Review at least annually and earlier after an incident, service interruption, or a change in needs, preferences, goals, funding or at the participant’s request.",fields:[["plan_details","Plan control","section"],["participant","Participant"],["plan_date","Plan date","date"],["plan_type","Plan type","select",["First plan","Scheduled review","Change review","Post-incident review","Participant-requested review"]],["review_date","Next review date (no later than 12 months)","date"],["participant_involvement","How the participant was involved and consented","textarea"],["support_people","Representative, nominee, guardian, family or other people involved","textarea",false],["person_profile","About the participant","section"],["background_culture","Background, culture, identity, language, values and important relationships","textarea"],["communication","Communication methods, aids, interpreter needs and signs of pain, distress or urgent concern","textarea"],["strengths_goals","Strengths, goals and how workers will support progress","textarea"],["daily_support","Daily living support","section"],["functional_support","Housework, transport, shopping, meals, money, phone, mobility, transfers and personal-care support","textarea"],["health_support","Health conditions, appointments, allied health, medication support, pain, falls, skin, swallowing and escalation","textarea"],["mealtime_support","Allergies, diet, texture, seating, preparation and mealtime assistance","textarea"],["social_support","Family, relationships, interests, community, faith, employment and social support","textarea"],["decision_support","Decision-making, memory, mood, planning and supported-decision arrangements","textarea"],["delivery_controls","Safe delivery","section"],["worker_matching","Worker characteristics, gender, language, culture or other preferences","textarea",false],["risks_emergency","Key risks, safeguards, emergency needs and escalation instructions","textarea"],["ndis_scope","NDIS goals, funding/service scope and external providers involved","textarea"],["information_sharing","Information-sharing consent, accessible storage and who receives the current plan","textarea"],["worker_quick_read","What every worker must know before support","textarea"],["supervisor_confirmation","Supervisor confirmation","select",["Participant involved, risks checked and plan approved","Needs participant confirmation","Needs risk assessment","Draft — not approved for delivery"]]]},
 emergencyPlan:{title:"Participant emergency plan",category:"Participant service delivery",help:"Make this accessible before support begins, coordinate it with the household plan and test it. Review at least annually and whenever health, support, equipment, household or emergency arrangements change.",fields:[["plan_details","Plan control","section"],["participant","Participant"],["plan_date","Plan date","date"],["review_date","Next review date","date"],["contacts","Emergency contacts, GP, pharmacy and authorised support people","textarea"],["health_needs","Health risks, diagnoses, allergies, medication and preferred hospital","textarea"],["communication_mobility","Communication, behaviour, mobility and physical-assistance requirements","textarea"],["equipment","Required equipment, backup power and continuity needs","textarea",false],["response","Emergency response","section"],["fire_evacuation","Fire response, primary and secondary routes, assistance, estimated evacuation time and meeting point","textarea"],["medical_emergency","Medical emergency steps and escalation","textarea"],["disaster_outage","Disaster, hazardous exposure, power outage, food, water and communication arrangements","textarea"],["worker_steps","Exact worker actions and who must be contacted","textarea"],["shared_home","Shared-home coordination","section"],["resident_coordination","Resident evacuation order, conflicting needs and whether one worker can safely assist everyone","textarea"],["individual_vs_shared","When to use an individual response and when to use the coordinated household response","textarea"],["kit","Evacuation kit — 3 days food/water, 7 days medication, documents, communication and special items","textarea"],["testing","Testing and approval","section"],["last_drill","Last drill or test date","date",false],["test_findings","Drill findings, participant feedback and improvements","textarea",false],["accessible_location","Where the current accessible plan is stored and how workers were briefed","textarea"],["supervisor_confirmation","KMP / supervisor confirmation","select",["Approved before support and current","Changes or drill required","Participant confirmation required","Draft — not approved for delivery"]]]},
 riskAssessment:{title:"Participant risk assessment",category:"Participant service delivery",help:"Assess risks with the participant, record proportionate controls and preserve dignity of risk. Review after incidents, household or support changes and at the scheduled review.",fields:[["assessment_details","Assessment details","section"],["participant","Participant"],["assessment_date","Assessment date","date"],["review_date","Next review date","date"],["participant_input","Participant and representative input","textarea"],["risks","Risks and safeguards","section"],["health_daily_risks","Clinical, medication, mobility, personal-care, mealtime and daily-living risks","textarea"],["environmental_risks","Home, equipment, emergency, community, transport and online risks","textarea"],["safeguarding_risks","Abuse, neglect, exploitation, financial, social, co-resident, visitor and worker-practice risks","textarea"],["communication_risks","Communication, decision-making, inconsistency and single-worker risks","textarea"],["overall_risk","Overall current risk","select",["Low","Medium","High","Critical — immediate escalation"]],["controls","Controls, responsible person and timeframes","textarea"],["residual_risk","Residual risk after controls","select",["Low","Medium","High","Critical — support must not proceed"]],["escalation","Escalation, incident or improvement actions","textarea",false],["confirmation","Assessment status","select",["Participant consulted and assessment approved","Participant confirmation required","Controls not yet complete","Immediate escalation underway"]]]},
 intake:{title:"Participant intake & SIL onboarding",category:"Participant service delivery",help:"Complete at onboarding and update before delivery where communication, decision-making, shared-living, health or support information changes.",fields:[["identity","Identity and service details","section"],["participant","Participant"],["intake_date","Intake date","date"],["ndis_funding","NDIS number, plan dates, funding management and agreed SIL scope","textarea"],["contacts","Participant contacts, emergency contacts and support people","textarea"],["health_support","Health, mental health, medication, allergies, mobility and personal-care needs","textarea"],["communication","Communication and decisions","section"],["communication_profile","Language, hearing, communication modes, aids, time, environment and what workers must not do","textarea"],["decision_support","How the participant wants decisions supported and trusted supporters","textarea"],["authorised_person","Any legally authorised decision-maker, scope and appointment evidence","textarea",false],["shared_living","Shared living and ordinary life","section"],["living_preferences","Resident, worker, routine, culture, gender and language preferences","textarea"],["visitors_private_space","Visitors, relationships, private space and possessions preferences","textarea"],["behaviour_scope","Behaviour Support Plan provider and scope — if applicable","textarea",false],["consent","Participant consent, acknowledgement and accessible format used","textarea"],["readiness","Onboarding readiness","select",["Ready — required plans and instructions confirmed","Plans or assessments still required","Participant confirmation required","Support must not commence"]]]},
 communication:{title:"Communication & decision-making profile",category:"Participant profile",help:"Complete before support starts. Use the participant’s words, separate trusted supporters from legally authorised decision-makers, and review at least annually or whenever needs or preferences change.",fields:[["profile_details","Profile control","section"],["participant","Participant"],["profile_date","Profile date","date"],["review_date","Next review date","date"],["participant_consent","How the participant completed or consented to this profile","textarea"],["communication","How the participant communicates","section"],["preferred_communication","Primary and secondary communication methods, language, aids and AAC","textarea"],["yes_no_distress","How the person shows yes, no, uncertainty, pain, distress or withdrawal","textarea"],["understanding_support","How to present information, ask questions and check understanding","textarea"],["environment_time","Best environment, time of day, number of options and time needed","textarea"],["barriers","What makes communication easier or harder, including fatigue, pain or medication","textarea"],["do_not_assume","Things workers must not do or assume","textarea"],["decisions","Supported decisions","section"],["decision_support","Decisions made independently and support requested for meals, routines, visitors, community, health, money and change","textarea"],["trusted_people","Trusted supporters or advocates and their role","textarea",false],["authorised_decision_maker","Legally authorised decision-maker, evidence and exact scope","textarea",false],["dignity_of_risk","How to provide non-coercive risk information, support dignity of risk and escalate serious danger","textarea"],["culture_identity","Cultural, identity, family, community or worker preferences","textarea",false],["signs_more_time","Signs the participant needs more time, a break or a different approach","textarea"],["confirmation","Profile status","select",["Participant confirmed and profile current","Participant confirmation required","Authorisation evidence required","Draft — workers must seek supervisor guidance"]]]},
 instructions:{title:"Participant-specific worker instructions",category:"Participant instructions",help:"This is the worker’s quick-read source of current authorised instructions. Review before every shift and update after relevant support-plan, risk, health, household or preference changes.",fields:[["instruction_control","Instruction control","section"],["participant","Participant"],["house","SIL home"],["effective_date","Effective date","date"],["review_date","Review date","date"],["must_know","What workers must know","section"],["communication","Communication and decision-support instructions","textarea"],["routines","Preferred routines and daily choices","textarea"],["personal_care","Personal-care and dignity preferences","textarea",false],["meals","Meal, allergy, texture and mealtime instructions","textarea",false],["medication_health","Medication, health monitoring and escalation instructions","textarea"],["mobility_equipment","Mobility, transfers and equipment instructions","textarea",false],["community_relationships","Community, family, relationships and social supports","textarea",false],["privacy_visitors","Privacy, visitors, room access, keys and possessions","textarea"],["behaviour_support","Behaviour Support Plan scope and prohibited or restrictive practices","textarea",false],["emergency","Participant-specific emergency actions","textarea"],["quick_reference","Quick reference","section"],["must_do","Workers MUST","textarea"],["must_not_do","Workers MUST NOT","textarea"],["acknowledgement","Worker acknowledgement requirement","select",["Read before every shift and after each update","Supervisor briefing required before next shift","Supervised shifts only until competency confirmed"]]]},
 choice:{title:"Participant choice & daily life record",category:"Supported decision-making",help:"Complete during or immediately after the shift. Record the actual choice in the participant’s own words and any communication support. This does not replace an incident report or support-plan update.",fields:[["participant","Participant"],["house","SIL home","text",false],["date","Date and time","datetime-local"],["category","Choice category","select",["Meals","Activities","Routine","Visitors","Workers","Community","Home environment","Health","Money","Change","Other"]],["decision","Decision or choice offered"],["options","Options or accessible information provided","textarea"],["support","Communication and decision support provided","textarea",false],["choice","Participant’s choice in their own words","textarea"],["risk","Dignity-of-risk information and response","textarea",false],["outcome","Outcome and follow-up","textarea"],["preference_change","Preference or routine change identified","select",["No","Yes — supervisor review needed"]],["plan_update","Support plan, risk assessment or incident follow-up","select",["Not required","Support plan review","Risk review","Incident report","Immediate supervisor escalation"]],["worker","Worker recording"],["declaration","I declare this is a true, factual record of the participant’s choice","checkbox"]]},
agreementExplanation:{title:"SIL agreement explanation record",category:"Participant agreement",help:"Record how the SIL service agreement was explained in an accessible way, including that I-Care Connect delivers supports and is not the participant’s housing provider.",fields:[["participant","Participant"],["date","Explanation date","date"],["documents","Document explained","select",["SIL Service Agreement"]],["format","Accessible format / communication support","textarea"],["separation_explained","How the separation between housing and SIL support was explained","textarea"],["rights_understood","Participant’s questions and demonstrated understanding","textarea"],["support_person","Support person / advocate present","text",false],["confirmation","Participant confirmation / signature status","select",["Signed","Verbal confirmation recorded","Awaiting signature","Further explanation required"]]]},
serviceAgreement:{title:"SIL service agreement register",category:"Participant agreement",help:"This register does not replace the signed agreement. Attach the executed agreement in Florence’s Compliance Centre.",fields:[["participant","Participant"],["commencement","Commencement date","date"],["review_date","Review date","date"],["signed_status","Status","select",["Draft","Provided for review","Signed","Expired / replaced"]],["support_scope","Agreed SIL support scope","textarea"],["fees_reference","Pricing / schedule reference","textarea",false],["termination_terms","Termination / change arrangements confirmed","textarea",false],["document_location","Signed document location or reference","text",false]]},
rights:{title:"Welcome & rights acknowledgement",category:"Participant rights",help:"Record provision of rights information in a form the participant can understand.",fields:[["participant","Participant"],["date","Date provided","date"],["format","Format / communication method"],["topics","Rights explained","textarea"],["advocacy","Advocacy and complaint options explained","textarea"],["questions","Questions / concerns raised","textarea",false],["acknowledgement","Acknowledgement status","select",["Signed","Verbal acknowledgement","Further support required"]]]},
privateSpace:{title:"Visitor & private-space preferences",category:"Participant rights",help:"A participant’s SIL home is their home. Preferences support privacy and safeguarding; they are not provider permission conditions.",fields:[["participant","Participant"],["house","SIL support location"],["visitor_preferences","Visitor preferences","textarea"],["private_space","Private-space and room-access preferences","textarea"],["keys_possessions","Keys and possessions arrangements","textarea",false],["relationships","Relationship and privacy supports","textarea",false],["review_date","Review date","date"]]},
domesticChecklist:{title:"Domestic duties checklist",category:"Domestic duties",help:"Tick each duty actually completed during this accepted shift. Leave uncompleted or not-required duties unticked and explain them below. Only enter a private space with the participant’s consent or agreed access.",fields:[["participant","Participant"],["shift","Accepted shift","shift"],["shift_date","Date completed","date"],["duties","Domestic duties completed","checklist"],["participant_preferences","Participant choices, routines and preferences followed","textarea",false],["not_completed_reason","Duties not required or not completed — and why","textarea",false],["follow_up_required","Maintenance, hazards, low supplies or other follow-up","textarea",false],["declaration_confirmed","I confirm this checklist is true and only includes duties I completed","checkbox"],["pin","Your six-digit signing PIN","password"]]},
handover:{title:"SIL shift handover",category:"Shift handover",help:"Complete at the end of every shift. Record facts and direct observations, not assumptions.",fields:[["participant","Participant"],["house","SIL home"],["shift_date","Shift date","date"],["shift_start","Shift start","time",false],["shift_end","Shift end","time",false],["outgoing_worker","Outgoing worker"],["incoming_worker","Incoming worker"],["wellbeing","Participant wellbeing and significant observations","textarea"],["daily_support","Meals, personal care, activities and choices","textarea",false],["medication","Medication matters","textarea",false],["incidents","Incidents, behaviours or safeguarding concerns","textarea",false],["appointments","Appointments / upcoming activities","textarea",false],["household","Household, maintenance and visitor matters","textarea",false],["actions","Outstanding actions","textarea",false],["incoming_acknowledged","Incoming worker acknowledgement","select",["Acknowledged","Awaiting acknowledgement"]]]},
induction:{title:"SIL worker house induction",category:"Worker induction",help:"Must be completed before the worker’s first shift at the property and repeated after material changes.",fields:[["worker","Worker"],["house","SIL home"],["date","Induction date","date"],["participants_reviewed","Participant profiles and instructions reviewed","select",["Yes","Partly — follow-up required","No"]],["emergency_reviewed","Emergency and continuity arrangements reviewed","select",["Yes","No"]],["safeguarding_reviewed","Safeguarding and house risks reviewed","select",["Yes","No"]],["medication_reviewed","Medication arrangements reviewed","select",["Yes","Not applicable","No"]],["house_practice","House routines, privacy and visitor rights reviewed","select",["Yes","No"]],["gaps","Gaps / supervised practice required","textarea",false],["supervisor","Supervisor / Team Leader"]]},
 competency:{title:"SIL worker competency",category:"Worker competency",help:"Assess knowledge and observed practice before unsupervised work. A worker who is not yet competent must not work unsupervised until remedial action and reassessment are complete.",fields:[["worker","Worker"],["assessment_date","Assessment date","date"],["assessor","Assessor"],["method","Assessment method","select",["Observed practice","Knowledge questions","Scenario assessment","Document review","Combined assessment"]],["evidence_areas","Competency evidence","section"],["decision_communication","Supported decision-making, communication, participant rights and active support evidence","textarea"],["safety_practice","Safeguarding, trauma-informed care, cultural safety and de-escalation evidence","textarea"],["participant_instructions","Participant instructions, behaviour-support scope, medication and emergency evidence","textarea"],["records_handover","Objective records, incidents, handover and escalation evidence","textarea"],["outcome","Overall outcome","select",["Competent","Competent with conditions","Not yet competent"]],["conditions","Conditions, supervision or remedial training","textarea",false],["unsupervised","Unsupervised SIL shifts","select",["Approved","Not approved until reassessed"]],["reassessment_date","Reassessment date","date",false],["refresher_due","Refresher due","date"]]},
 training:{title:"SIL training register entry",category:"Worker training",help:"Review the register at least every six months. Attendance alone is not competency; record the outcome and required refresher.",fields:[["worker","Worker"],["topic","Training topic","select",["Supported decision-making","Communication and AAC","Participant rights and active support","Safeguarding and reportable incidents","Trauma-informed and culturally safe practice","Positive behaviour support and restrictive-practice boundaries","Medication support","Emergency and evacuation","Objective documentation and handover","Participant-specific instructions","Other"]],["completed","Completion date","date"],["method","Delivery / assessment method"],["trainer","Trainer / assessor"],["evidence","Evidence or certificate reference","textarea",false],["outcome","Outcome","select",["Competent","Competent with conditions","Not yet competent","Refresher completed","Knowledge only — competency pending"]],["actions","Conditions, remedial action or supervision","textarea",false],["refresher_due","Refresher due","date"]]},
 observation:{title:"SIL practice observation",category:"Practice observation",help:"Observe real practice, discuss findings and act on gaps. An unsatisfactory outcome means no unsupervised shift until remedial action and reassessment.",fields:[["worker","Worker"],["house","SIL home"],["date","Observation date","date"],["observer","Observer"],["areas","Rights, communication, choice, active support, safety, culture, de-escalation, records, handover and emergency practices observed","textarea"],["strengths","Factual strengths observed","textarea"],["concerns","Concerns or non-conformities","textarea",false],["participant_rights","How participant rights, dignity, communication and choice were demonstrated","textarea"],["outcome","Overall outcome","select",["Strong","Satisfactory","Requires improvement","Unsatisfactory"]],["actions","Remedial actions, owner and due date","textarea",false],["unsupervised","Unsupervised SIL shifts","select",["Approved","Not approved until reassessed"]],["reassessment_date","Reassessment date","date",false],["continuous_improvement","Continuous-improvement entry or escalation","textarea",false]]},
provider:{title:"Edit provider profile",category:"Provider governance",help:"Verify these details against current registration and corporate records before an audit.",fields:[["legalName","Legal name"],["abn","ABN"],["address","Business address"],["registrationGroup","SIL registration group"],["keyManagementPersonnel","Key Management Personnel"],["seniorWorker","Senior worker / operational contact","text",false],["reviewCycle","Policy review cycle"],["status","Verification status","textarea"]]}
};
let state={provider:{...PROVIDER},records:[]},activeTab="dashboard";
function participantName(participantId){
 const participant=directory.participants.find(item=>item.id===participantId);
 return participant?.preferred_name||participant?.full_name||"Participant";
}
function staffName(staffId){return directory.staff.find(item=>item.id===staffId)?.full_name||"Worker"}
function rowToRecord(row){return{id:row.id,type:row.record_type,category:row.category,title:row.title,createdAt:row.created_at,updatedAt:row.updated_at,fields:row.fields||{},status:row.status,participant_id:row.participant_id,staff_id:row.staff_id}}
async function loadSilState(){
 const org=currentProfile.organisation_id;
 const [recordsResult,providerResult,participantsResult,staffResult,shiftsResult]=await Promise.all([
  db.from("sil_records").select("*").eq("organisation_id",org).is("archived_at",null).order("created_at",{ascending:false}),
  db.from("sil_provider_profiles").select("profile").eq("organisation_id",org).maybeSingle(),
  db.from("participants").select("id,full_name,preferred_name").eq("organisation_id",org).order("full_name"),
  db.from("profiles").select("id,full_name,role,active").eq("organisation_id",org).eq("active",true).in("role",["staff","supervisor"]).order("full_name"),
  db.from("shifts").select("id,participant_id,assigned_staff_id,starts_at,ends_at,shift_type,status,response").eq("organisation_id",org).eq("assigned_staff_id",currentProfile.id).eq("status","Published").eq("response","Accepted").gte("ends_at",new Date(Date.now()-86400000).toISOString()).order("starts_at")
 ]);
 const failed=[recordsResult,providerResult,participantsResult,staffResult,shiftsResult].find(result=>result.error);
 if(failed)throw failed.error;
 state.records=(recordsResult.data||[]).map(rowToRecord);
 state.provider={...PROVIDER,...(providerResult.data?.profile||{})};
 directory={participants:participantsResult.data||[],staff:staffResult.data||[],shifts:shiftsResult.data||[]};
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function toast(t){const e=$("#sil-toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2400)}
function uid(){return crypto.randomUUID?.()||Date.now()+"-"+Math.random().toString(16).slice(2)}
const reviewFieldNames=["review_date","next_review","next_meeting","refresher_due","reassessment_date"];
function reviewDateOf(record){
 const value=reviewFieldNames.map(name=>record.fields?.[name]).find(Boolean);
 if(!value)return null;
 const date=new Date(`${String(value).slice(0,10)}T23:59:59`);
 return Number.isNaN(date.valueOf())?null:date
}
function statusOf(record){
 if(record.status==="Archived")return"Archived";
 const values=Object.values(record.fields||{}).join(" ");
 if(/Draft|Pending|Awaiting|Needs participant|Needs risk|not yet competent|Not approved|Support must not commence|Immediate escalation|Critical/i.test(values))return"Needs confirmation";
 const review=reviewDateOf(record);
 if(review&&review<new Date())return"Overdue";
 return record.status||"Complete"
}
function badge(s){const c=/overdue|not yet|high|immediate/i.test(s)?"red":/draft|pending|needs|awaiting|medium/i.test(s)?"amber":"good";return`<span class="badge ${c}">${esc(s)}</span>`}
function fmt(v){if(!v)return"";const d=new Date(v);return isNaN(d)?v:new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric",hour:v.includes?.("T")?"numeric":undefined,minute:v.includes?.("T")?"2-digit":undefined}).format(d)}
function fieldHtml(f,recordType){
 let [name,label,type="text",opts=[],required=true]=f;
 if(typeof opts==="boolean"){required=opts;opts=[]}
 if(type==="section")return`<div class="sil-form-section"><h4>${esc(label)}</h4></div>`;
 const dynamicRequired=(name==="participant"&&participantRecordTypes.has(recordType))||(name==="worker"&&workerRecordTypes.has(recordType));
 const mustComplete=dynamicRequired||required,req=mustComplete?" required":"",hint=mustComplete?"":" <small>(optional)</small>";
 if(name==="participant"){
  const options=directory.participants.map(item=>`<option value="${item.id}">${esc(item.preferred_name||item.full_name)}</option>`).join("");
  return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select participant…</option>${options}</select></label>`
 }
 if(type==="shift"){
  const options=directory.shifts.map(item=>`<option value="${item.id}" data-participant="${item.participant_id}">${esc(shiftLabel(item))}</option>`).join("");
  return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select accepted shift…</option>${options}</select></label>`
 }
 if(type==="checklist")return`<div class="domestic-checklist">${DOMESTIC_TASKS.map(([section,tasks])=>`<fieldset><legend>${esc(section)}</legend>${tasks.map(([key,text])=>`<label class="sil-checkbox domestic-task"><input name="task_${key}" type="checkbox" value="true"><span>${esc(text)}</span></label>`).join("")}</fieldset>`).join("")}</div>`;
 if(name==="worker"){
  if(!workerRecordTypes.has(recordType))return`<label>${label}<input name="${name}" value="${esc(currentProfile?.full_name||"Signed-in worker")}" readonly required></label>`;
  const options=directory.staff.map(item=>`<option value="${item.id}">${esc(item.full_name)}</option>`).join("");
  return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select worker…</option>${options}</select></label>`
 }
 if(type==="textarea")return`<label>${label}${hint}<textarea name="${name}"${req}></textarea></label>`;
 if(type==="select")return`<label>${label}${hint}<select name="${name}"${req}><option value="">Select…</option>${(Array.isArray(opts)?opts:[]).map(option=>{const value=typeof option==="string"?option:option.value,labelText=typeof option==="string"?option:option.label;return`<option value="${esc(value)}">${esc(labelText)}</option>`}).join("")}</select></label>`;
 if(type==="checkbox")return`<label class="sil-checkbox"><input name="${name}" type="checkbox" value="Yes"${req}><span>${esc(label)}</span></label>`;
 return`<label>${label}${hint}<input name="${name}" type="${type}"${req}></label>`
}
function shiftLabel(shift){
 const start=new Date(shift.starts_at),end=new Date(shift.ends_at);
 const day=new Intl.DateTimeFormat("en-AU",{weekday:"short",day:"numeric",month:"short"}).format(start);
 const time=new Intl.DateTimeFormat("en-AU",{hour:"numeric",minute:"2-digit"}).format(start);
 return `${participantName(shift.participant_id)} · ${day} ${time} · ${shift.shift_type||"Shift"}`
}
function filterDomesticShifts(){
 const participant=$("#sil-dialog-fields [name=participant]")?.value||"";
 const select=$("#sil-dialog-fields [name=shift]");if(!select)return;
 [...select.options].forEach((option,index)=>{if(index)option.hidden=Boolean(participant)&&option.dataset.participant!==participant});
 if(select.selectedOptions[0]?.hidden)select.value=""
}
function todayValue(){return new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)}
function localDateTimeValue(){return new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16)}
function openForm(type){
 const schema=schemas[type];if(!schema)return;
 if(currentProfile?.role!=="supervisor"&&!workerCreateRecordTypes.has(type)){toast("This SIL record must be completed by a supervisor");return}
 $("#sil-dialog-title").textContent=schema.title;
 $("#sil-dialog-help").innerHTML=`${esc(schema.help)}<div class="sil-required-note">Fields without “optional” must be completed before saving.</div>`;
 $("#sil-form").dataset.type=type;
 $("#sil-dialog-fields").innerHTML=schema.fields.map(field=>fieldHtml(field,type)).join("");
 const params=new URL(location.href).searchParams,participant=params.get("participant");
 const participantSelect=$("#sil-dialog-fields [name=participant]");
 if(participant&&participantSelect&&directory.participants.some(item=>item.id===participant))participantSelect.value=participant;
 if(type==="domesticChecklist"){
  participantSelect?.addEventListener("change",filterDomesticShifts);
  filterDomesticShifts();
 }
 schema.fields.forEach(([name,,type])=>{
  const input=$("#sil-dialog-fields [name='"+name+"']");
  if(!input||input.value)return;
  if(type==="date"&&/(^date$|_date$|^completed$|^effective_date$|^profile_date$|^plan_date$|^intake_date$|^assessment_date$)/.test(name))input.value=todayValue();
  if(type==="datetime-local"&&/(date|meeting)/.test(name))input.value=localDateTimeValue();
 });
 const status=$("#sil-dialog-status");if(status){status.textContent="";status.classList.add("hidden")}
 const dialog=$("#sil-dialog");dialog.showModal?dialog.showModal():dialog.setAttribute("open","")
}
function closeForm(){const dialog=$("#sil-dialog");dialog.close?dialog.close():dialog.removeAttribute("open")}
function fieldLabel(record,key){
 const field=schemas[record.type]?.fields?.find(([name])=>name===key);
 return field?.[1]||key.replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase())
}
function evidenceUrl(recordId){return`sil-record.html?id=${encodeURIComponent(recordId)}`}
async function submit(event){
 event.preventDefault();
 const formElement=event.currentTarget,type=formElement.dataset.type,schema=schemas[type];
 const submitButton=formElement.querySelector('button[type="submit"]');
 if(!schema)return;
 submitButton.disabled=true;submitButton.textContent="Saving securely…";
 try{
  const values=Object.fromEntries(new FormData(formElement));
  if(type==="domesticChecklist"){
   const participantId=String(values.participant||""),shiftId=String(values.shift||"");
   const tasks={};
   DOMESTIC_TASKS.flatMap(([,items])=>items).forEach(([key])=>{if(values["task_"+key]==="true")tasks[key]=true});
   if(!participantId)throw new Error("Choose the participant this checklist belongs to");
   if(!shiftId)throw new Error("Choose your accepted shift");
   if(!Object.keys(tasks).length)throw new Error("Tick at least one duty you completed");
   const {error}=await db.rpc("record_domestic_checklist",{
    p_participant_id:participantId,p_shift_id:shiftId,p_shift_date:values.shift_date,
    p_tasks:tasks,p_participant_preferences:values.participant_preferences||"",
    p_not_completed_reason:values.not_completed_reason||"",p_follow_up_required:values.follow_up_required||"",
    p_pin:values.pin||"",p_declaration_confirmed:values.declaration_confirmed==="Yes"
   });
   if(error)throw error;
  }else if(type==="provider"){
   const {error}=await db.from("sil_provider_profiles").upsert({organisation_id:currentProfile.organisation_id,profile:{...state.provider,...values},updated_by:currentProfile.id},{onConflict:"organisation_id"});
   if(error)throw error;
  }else{
   const participantId=participantRecordTypes.has(type)?String(values.participant||""):null;
   const staffId=workerRecordTypes.has(type)?String(values.worker||""):null;
   if(participantRecordTypes.has(type)&&!participantId)throw new Error("Choose the participant this SIL record belongs to");
   if(workerRecordTypes.has(type)&&!staffId)throw new Error("Choose the worker this SIL record belongs to");
   if(participantId)values.participant=participantName(participantId);
   if(staffId)values.worker=staffName(staffId);
   if(["supportPlan","emergencyPlan","riskAssessment","communication","instructions"].includes(type)&&values.review_date){
    const source=values.plan_date||values.assessment_date||values.profile_date||values.effective_date||todayValue();
    const days=(new Date(values.review_date)-new Date(source))/86400000;
    if(days<0)throw new Error("The review date cannot be before the record date");
    if(days>366)throw new Error("Set the next review no later than 12 months after this record");
   }
   const status=/Draft|Pending|Awaiting|Needs participant|Needs risk|not yet competent|Not approved|Support must not commence|Immediate escalation|Critical/i.test(Object.values(values).join(" "))?"Needs confirmation":"Complete";
   const {error}=await db.from("sil_records").insert({organisation_id:currentProfile.organisation_id,participant_id:participantId||null,staff_id:staffId||null,record_type:type,category:schema.category,title:schema.title,fields:values,status,created_by:currentProfile.id,updated_by:currentProfile.id});
   if(error)throw error;
  }
  formElement.reset();closeForm();await loadSilState();render();toast(type==="provider"?"Provider profile saved securely":"SIL record saved securely")
 }catch(error){toast(error.message||"Florence could not save this SIL record")}
 finally{submitButton.disabled=false;submitButton.textContent="Save"}
}
function recordCard(r){
 const entries=Object.entries(r.fields||{}).filter(([,value])=>value).slice(0,5),riskLevel=r.fields?.overall_risk||r.fields?.risk_level||"",risk=riskLevel?` sil-risk-${String(riskLevel).split(" ")[0].toLowerCase()}`:"";
 const archive=currentProfile?.role==="supervisor"?`<button class="link" data-archive-record="${r.id}">Archive record</button>`:"";
 return`<article class="record sil-evidence-record${risk}"><div class="record-top"><div><h3><a class="link sil-record-title-button" href="${evidenceUrl(r.id)}">${esc(r.title)}</a></h3><p>${esc(r.category)} · ${fmt(r.createdAt)}</p></div>${badge(statusOf(r))}</div><p>${entries.map(([key,value])=>`<strong>${esc(fieldLabel(r,key))}:</strong> ${esc(value)}`).join("<br>")}</p><div class="sil-record-actions"><a class="secondary button-link" href="${evidenceUrl(r.id)}">View completed form</a>${archive}</div></article>`
}
const requiredParticipantRecords=[
 ["intake","Intake & onboarding","📥"],["supportPlan","Support plan","🧩"],["emergencyPlan","Emergency plan","🚨"],["riskAssessment","Risk assessment","⚠️"],["communication","Communication & decisions","🗣️"],["instructions","Worker quick-read instructions","📌"]
];
function latestParticipantRecord(participantId,type){return state.records.find(record=>record.participant_id===participantId&&record.type===type)}
function readinessCard(participant){
 const name=participant.preferred_name||participant.full_name,items=requiredParticipantRecords.map(([type,label,icon])=>{
  const record=latestParticipantRecord(participant.id,type),status=record?statusOf(record):"Missing";
  const action=currentProfile?.role==="supervisor"?`<button type="button" class="link" data-open-participant-form="${type}" data-participant="${participant.id}">${record?"New version":"Create"}</button>`:"";
  return`<li><span>${icon} ${esc(label)}</span><span>${badge(status)}${action}</span></li>`
 });
 return`<article class="sil-readiness-card"><div class="record-top"><div><h3>${esc(name)}</h3><p>Everyday delivery readiness</p></div></div><ul>${items.join("")}</ul><div class="sil-record-actions"><a class="secondary button-link" href="sil.html?tab=shift&form=choice&participant=${participant.id}">Record today’s choice</a><a class="secondary button-link" href="sil.html?tab=shift&form=handover&participant=${participant.id}">Shift handover</a></div></article>`
}
function renderReadiness(){
 const container=$("#sil-readiness");if(!container)return;
 container.innerHTML=directory.participants.map(readinessCard).join("")||'<div class="sil-empty">No active participants are available.</div>'
}
function render(){const recs=state.records||[],complete=recs.filter(r=>statusOf(r)==="Complete").length,needs=recs.length-complete,houses=recs.filter(r=>r.category==="SIL home").length;
$("#sil-stats").innerHTML=`<div class="stat"><strong>${houses}</strong><span>Support locations</span></div><div class="stat"><strong>${recs.length}</strong><span>SIL records</span></div><div class="stat"><strong>${complete}</strong><span>Complete</span></div><div class="stat"><strong>${needs}</strong><span>Need attention</span></div>`;
$("#sil-storage-status").textContent="● Secure Supabase records";
const outstanding=recs.filter(r=>statusOf(r)!=="Complete");$("#sil-outstanding").innerHTML=outstanding.slice(0,8).map(recordCard).join("")||'<div class="sil-empty">Saved records are current. Check the participant readiness list for plans that have not yet been created.</div>';
const counts={};recs.forEach(r=>counts[r.category]=(counts[r.category]||0)+1);$("#sil-category-summary").innerHTML=Object.entries(counts).map(([k,v])=>`<article class="record"><div class="record-top"><div><h3>${esc(k)}</h3><p>${v} record${v===1?"":"s"}</p></div></div></article>`).join("")||'<div class="sil-empty">No records have been entered.</div>';
$("#sil-house-list").innerHTML=recs.filter(r=>["SIL home","House safeguarding","Consultation","House governance","Visitors"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">Add the first SIL support location to begin the service file.</div>';
$("#sil-participant-list").innerHTML=recs.filter(r=>["Participant service delivery","Participant profile","Participant instructions","Supported decision-making","Participant agreement","Participant rights"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">Participant SIL records will appear here.</div>';
$("#sil-shift-list").innerHTML=recs.filter(r=>["Shift handover","Supported decision-making","Visitors","Domestic duties"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">No SIL shift records.</div>';
$("#sil-worker-list").innerHTML=recs.filter(r=>["Worker induction","Worker competency","Worker training","Practice observation"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">No SIL workforce records.</div>';
renderReadiness();renderProvider();renderTemplates();renderResources();renderAuditEvidenceMatrix();renderEvidence();
}
function renderProvider(){const p=state.provider||PROVIDER;$("#sil-provider-profile").innerHTML=`<div class="sil-provider-grid">${Object.entries(p).map(([k,v])=>`<div class="sil-provider-item"><small>${esc(k.replace(/([A-Z])/g," $1"))}</small><strong>${esc(v)}</strong></div>`).join("")}</div>`}
async function loadPrivateDocuments(){
 const {data,error}=await db.from("compliance_documents")
  .select("id,title,storage_path,original_filename,uploaded_at,review_date,effective_date,version,lifecycle_status,catalogue_key,module,requirement_level,access_level")
  .eq("organisation_id",currentProfile.organisation_id)
  .eq("category","Controlled library")
  .order("uploaded_at",{ascending:false});
 if(error)throw error;
 privateDocuments=new Map();
 for(const document of data||[])if(!privateDocuments.has(document.title))privateDocuments.set(document.title,document);
}
async function loadEvidenceChecks(){
 if(currentProfile?.role!=="supervisor"){evidenceChecks=new Map();return}
 const {data,error}=await db.from("audit_evidence_checks").select("evidence_key,status,notes,reviewed_at").eq("organisation_id",currentProfile.organisation_id);
 if(error)throw error;
 evidenceChecks=new Map((data||[]).map(check=>[check.evidence_key,check]));
}
function controlledDocumentState(requirement){
 const document=privateDocuments.get(requirement.title);
 if(!document)return{label:"Missing",tone:"missing",document:null};
 if(document.lifecycle_status!=="Approved")return{label:document.lifecycle_status==="Needs review"?"Needs management review":"Draft — needs approval",tone:"review",document};
 const reviewDate=document.review_date?new Date(`${document.review_date}T00:00:00`):null;
 if(!reviewDate||Number.isNaN(reviewDate.getTime()))return{label:"Approved — review date missing",tone:"review",document};
 const days=Math.ceil((reviewDate-Date.now())/86400000);
 if(days<0)return{label:"Expired",tone:"expired",document};
 if(days<=60)return{label:`Review due in ${days} day${days===1?"":"s"}`,tone:"due",document};
 return{label:"Current and approved",tone:"current",document};
}
function resourceCard(requirement){
 const state=controlledDocumentState(requirement),document=state.document,supervisor=currentProfile?.role==="supervisor";
 const controls=[];
 if(document)controls.push(`<button type="button" class="secondary" data-open-private-document="${document.id}">Open private PDF</button>`);
 if(supervisor&&document?.lifecycle_status==="Approved"&&participantTemplateKeys.has(requirement.key))controls.push(`<button type="button" class="secondary" data-use-participant-template="${esc(requirement.key)}">Use for participant</button>`);
 if(supervisor)controls.push(`<button type="button" class="secondary" data-upload-controlled-document="${esc(requirement.key)}">${document?"Upload new version":"Upload PDF"}</button>`);
 if(supervisor&&document&&document.lifecycle_status!=="Approved")controls.push(`<button type="button" class="primary" data-approve-controlled-document="${document.id}">Approve</button>`);
 if(!document&&!supervisor)controls.push(`<button type="button" class="secondary" disabled>Private PDF pending</button>`);
 return`<article class="sil-resource-card sil-document-${state.tone}"><span aria-hidden="true">${requirement.icon}</span><div><div class="sil-document-heading"><strong>${esc(requirement.title)}</strong><span class="badge">${esc(requirement.module)}</span><span class="badge">${esc(requirement.requirement)}</span><span class="badge sil-status-${state.tone}">${esc(state.label)}</span></div><p>${esc(requirement.description)}</p>${document?`<small>Version ${Number(document.version)||1}${document.review_date?` · review ${esc(document.review_date)}`:""}</small>`:""}</div><div class="sil-document-actions">${controls.join("")}</div></article>`;
}
function documentGroups(documents){return[...new Set(documents.map(document=>document.group))].map(category=>`<section class="sil-document-group"><h4>${esc(category)}</h4><div class="stack">${documents.filter(document=>document.group===category).map(resourceCard).join("")}</div></section>`).join("")}
function renderLibraryStatus(){
 const states=controlledDocuments.map(controlledDocumentState),total=controlledDocuments.length,installed=states.filter(state=>state.document).length,current=states.filter(state=>state.tone==="current").length,attention=states.filter(state=>state.document&&state.tone!=="current").length,missing=total-installed,complete=current===total;
 const status=$("#sil-library-status");
 if(status)status.innerHTML=`<strong>${complete?"Private Florence library ready":`${current} of ${total} requirements current and approved`}</strong><br>${installed} installed · ${attention} need review or approval · ${missing} missing. The catalogue covers ${AUDIT_CATALOGUE.sourceReferenceCount} source files; the duplicate WHS source is controlled as one approved policy. Florence uses private Supabase Storage, not Google Drive links.`;
 const migration=$("#sil-library-import-status");
 if(migration&&!migration.dataset.progress)migration.textContent=complete?`All ${total} controlled requirements are current and approved.`:`${installed} of ${total} controlled requirements are installed; ${current} are current and approved.`;
 const approveAll=$("#sil-approve-all-documents"),draftCount=states.filter(state=>state.document&&state.document.lifecycle_status!=="Approved").length;
 if(approveAll){approveAll.classList.toggle("hidden",currentProfile?.role!=="supervisor"||draftCount===0);approveAll.textContent=draftCount?`Review and approve all ${draftCount} drafts`:"All documents approved"}
}
function renderTemplates(){
 $("#sil-template-register").innerHTML=currentProfile?.role==="supervisor"?documentGroups(controlledDocuments):"";
 renderLibraryStatus();
}
function renderResources(){
 const workerDocuments=controlledDocuments.filter(document=>document.access==="worker");
 $("#sil-worker-resources").innerHTML=documentGroups(workerDocuments);
 const supervisor=currentProfile?.role==="supervisor";
 $("#sil-supervisor-resource-panel").classList.toggle("hidden",!supervisor);
 $("#sil-supervisor-resources").innerHTML=supervisor?documentGroups(controlledDocuments):"";
 renderLibraryStatus();
}
function renderAuditEvidenceMatrix(){
 const target=$("#sil-audit-evidence-matrix");if(!target||currentProfile?.role!=="supervisor")return;
 const required=AUDIT_CATALOGUE.evidence.filter(item=>item.requirement==="Required"),ready=required.filter(item=>evidenceChecks.get(item.key)?.status==="Ready").length;
 const summary=$("#sil-audit-evidence-summary");
 if(summary)summary.innerHTML=`<div><strong>${ready}</strong><span>of ${required.length} required evidence areas verified</span></div><div><strong>${required.length-ready}</strong><span>required areas need action</span></div><div><strong>${AUDIT_CATALOGUE.evidence.length-required.length}</strong><span>conditional areas to confirm</span></div>`;
 target.innerHTML=AUDIT_CATALOGUE.evidence.map(item=>{
  const check=evidenceChecks.get(item.key)||{status:"Not checked",notes:""};
  return`<article class="sil-audit-evidence-card" data-evidence-card="${esc(item.key)}"><div><div class="sil-document-heading"><strong>${esc(item.title)}</strong><span class="badge">${esc(item.module)}</span><span class="badge">${esc(item.requirement)}</span></div><p>${esc(item.detail)}</p><small><strong>Florence location:</strong> ${esc(item.location)}</small></div><label>Status<select data-evidence-status><option${check.status==="Not checked"?" selected":""}>Not checked</option><option${check.status==="In progress"?" selected":""}>In progress</option><option${check.status==="Ready"?" selected":""}>Ready</option><option${check.status==="Not applicable"?" selected":""}>Not applicable</option></select></label><label>Audit note<textarea data-evidence-notes rows="2" placeholder="What was checked, what is missing, or why this does not apply">${esc(check.notes||"")}</textarea></label><button type="button" class="secondary" data-save-evidence-check="${esc(item.key)}">Save check</button></article>`;
 }).join("");
}
async function saveEvidenceCheck(evidenceKey){
 if(currentProfile?.role!=="supervisor")throw new Error("Only a supervisor can update audit checks");
 const card=$(`[data-evidence-card="${evidenceKey}"]`),status=card?.querySelector("[data-evidence-status]")?.value,notes=card?.querySelector("[data-evidence-notes]")?.value?.trim()||null;
 if(!card||!["Not checked","In progress","Ready","Not applicable"].includes(status))throw new Error("Choose a valid audit status");
 const item=AUDIT_CATALOGUE.evidence.find(entry=>entry.key===evidenceKey);
 if(!item)throw new Error("Audit evidence requirement not found");
 if(item.requirement==="Required"&&status==="Not applicable")throw new Error("A required evidence area cannot be marked not applicable");
 const {error}=await db.from("audit_evidence_checks").upsert({organisation_id:currentProfile.organisation_id,evidence_key:evidenceKey,status,notes,reviewed_by:currentProfile.id,reviewed_at:new Date().toISOString()},{onConflict:"organisation_id,evidence_key"});
 if(error)throw error;
 await loadEvidenceChecks();renderAuditEvidenceMatrix();toast("Audit evidence check saved")
}
async function openPrivateDocument(recordId){
 const openedWindow=window.open("about:blank","_blank");
 if(openedWindow)openedWindow.opener=null;
 try{
  const document=[...privateDocuments.values()].find(item=>item.id===recordId);
  if(!document)throw new Error("The private document record is not available");
  void auditSilAccess("DOWNLOAD","controlled_library",document.id,{title:document.title});
  const bucket=window.FLORENCE_CONFIG.storageBucket;
  const {data,error}=await db.storage.from(bucket).createSignedUrl(document.storage_path,120);
  if(error||!data?.signedUrl)throw error||new Error("Florence could not create the private document link");
  if(openedWindow)openedWindow.location.replace(data.signedUrl);
  else location.assign(data.signedUrl);
 }catch(error){
  try{openedWindow?.close()}catch(_ignored){}
  toast(error.message||"Florence could not open that private document")
 }
}
async function sha256Hex(buffer){
 const digest=await crypto.subtle.digest("SHA-256",buffer);
 return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,"0")).join("");
}
function closeParticipantTemplate(){
 pendingParticipantTemplate=null;
 $("#sil-participant-template-file").value="";
 $("#sil-participant-template-status").classList.add("hidden");
 $("#sil-participant-template-dialog").close()
}
function openParticipantTemplate(requirementKey){
 if(currentProfile?.role!=="supervisor")throw new Error("Only a supervisor can create participant document copies");
 const requirement=controlledDocuments.find(document=>document.key===requirementKey),master=requirement&&privateDocuments.get(requirement.title);
 if(!requirement||!participantTemplateKeys.has(requirement.key))throw new Error("This document is not a participant-use template");
 if(!master||master.lifecycle_status!=="Approved")throw new Error("Approve the master document before using it for a participant");
 if(!directory.participants.length)throw new Error("Add the participant to Florence before creating their document");
 pendingParticipantTemplate=requirement;
 $("#sil-participant-template-title").textContent=`Use ${requirement.title}`;
 $("#sil-participant-template-participant").innerHTML=directory.participants.map(participant=>`<option value="${participant.id}">${esc(participant.preferred_name||participant.full_name)}</option>`).join("");
 const requested=new URL(location.href).searchParams.get("participant");
 if(requested&&directory.participants.some(participant=>participant.id===requested))$("#sil-participant-template-participant").value=requested;
 $("#sil-participant-template-status").classList.add("hidden");
 $("#sil-participant-template-dialog").showModal()
}
function selectedParticipantTemplate(){
 const requirement=pendingParticipantTemplate,participant=directory.participants.find(item=>item.id===$("#sil-participant-template-participant").value),master=requirement&&privateDocuments.get(requirement.title);
 if(!requirement||!participant||!master)throw new Error("Choose a valid participant and template");
 return{requirement,participant,master}
}
function participantTemplateStatus(message,isError=false){
 const status=$("#sil-participant-template-status");status.textContent=message;status.classList.remove("hidden");status.classList.toggle("error",isError)
}
function downloadBlob(blob,name){
 const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)
}
async function createParticipantWorkingCopy(){
 const {requirement,participant,master}=selectedParticipantTemplate(),button=$("#sil-participant-template-download"),bucket=window.FLORENCE_CONFIG.storageBucket;
 button.disabled=true;
 try{
  participantTemplateStatus("Preparing the participant working copy…");
  const {data:blob,error:downloadError}=await db.storage.from(bucket).download(master.storage_path);
  if(downloadError||!blob)throw downloadError||new Error("Florence could not read the approved master PDF");
  const participantName=participant.preferred_name||participant.full_name,filename=`${requirement.key}-${participantName.replace(/[^a-zA-Z0-9_-]/g,"_")}-working-copy.pdf`,storagePath=`${currentProfile.organisation_id}/participant/${participant.id}/${Date.now()}-${filename}`;
  const {error:uploadError}=await db.storage.from(bucket).upload(storagePath,blob,{contentType:"application/pdf",upsert:false});
  if(uploadError)throw uploadError;
  const {data,error}=await db.from("compliance_documents").insert({organisation_id:currentProfile.organisation_id,scope:"Participant",subject_type:"participant",subject_id:participant.id,subject_name:participantName,category:"Participant form — working copy",title:requirement.title,storage_path:storagePath,original_filename:filename,mime_type:"application/pdf",version:1,uploaded_by:currentProfile.id,uploaded_at:new Date().toISOString()}).select("id").single();
  if(error){await db.storage.from(bucket).remove([storagePath]).catch(()=>{});throw error}
  await auditSilAccess("CREATE_PARTICIPANT_WORKING_COPY","compliance_documents",data.id,{participant_id:participant.id,catalogue_key:requirement.key,title:requirement.title});
  downloadBlob(blob,filename);
  participantTemplateStatus(`Working copy saved privately to ${participantName}'s Florence file and downloaded. Complete it, then return here to upload the completed PDF.`)
 }catch(error){participantTemplateStatus(error.message||"The working copy could not be created",true);throw error}
 finally{button.disabled=false}
}
async function uploadCompletedParticipantTemplate(file){
 const {requirement,participant}=selectedParticipantTemplate(),button=$("#sil-participant-template-upload"),bucket=window.FLORENCE_CONFIG.storageBucket;
 if(!file||!file.name.toLowerCase().endsWith(".pdf")||(file.type&&file.type!=="application/pdf"))throw new Error("Choose the completed PDF");
 if(file.size>window.FLORENCE_CONFIG.maxDocumentBytes)throw new Error("The completed PDF exceeds Florence's document size limit");
 if(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=="%PDF-")throw new Error("The selected file is not a valid PDF");
 button.disabled=true;
 try{
  participantTemplateStatus("Saving the completed PDF to the participant file…");
  const participantName=participant.preferred_name||participant.full_name,safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),storagePath=`${currentProfile.organisation_id}/participant/${participant.id}/${Date.now()}-${safe}`;
  const {error:uploadError}=await db.storage.from(bucket).upload(storagePath,file,{contentType:"application/pdf",upsert:false});
  if(uploadError)throw uploadError;
  const {data,error}=await db.from("compliance_documents").insert({organisation_id:currentProfile.organisation_id,scope:"Participant",subject_type:"participant",subject_id:participant.id,subject_name:participantName,category:"Participant form — completed",title:requirement.title,storage_path:storagePath,original_filename:file.name,mime_type:"application/pdf",version:1,uploaded_by:currentProfile.id,uploaded_at:new Date().toISOString()}).select("id").single();
  if(error){await db.storage.from(bucket).remove([storagePath]).catch(()=>{});throw error}
  await auditSilAccess("UPLOAD_COMPLETED_PARTICIPANT_FORM","compliance_documents",data.id,{participant_id:participant.id,catalogue_key:requirement.key,title:requirement.title});
  participantTemplateStatus(`Completed ${requirement.title} saved securely in ${participantName}'s participant file.`);
  toast("Completed participant document saved")
 }catch(error){participantTemplateStatus(error.message||"The completed PDF could not be saved",true);throw error}
 finally{button.disabled=false;$("#sil-participant-template-file").value=""}
}
async function uploadControlledDocument(requirement,file,reviewDate){
 if(currentProfile?.role!=="supervisor")throw new Error("Only a supervisor can upload controlled documents");
 if(!requirement||!controlledDocuments.some(document=>document.key===requirement.key))throw new Error("Controlled document requirement not found");
 if(!file||!file.name.toLowerCase().endsWith(".pdf")||(file.type&&file.type!=="application/pdf"))throw new Error("Choose the approved PDF version of this document");
 if(file.size>window.FLORENCE_CONFIG.maxDocumentBytes)throw new Error("The PDF exceeds Florence’s document size limit");
 if(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=="%PDF-")throw new Error("The selected file is not a valid PDF");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate||"")||new Date(`${reviewDate}T00:00:00`)<new Date(new Date().toISOString().slice(0,10)+"T00:00:00"))throw new Error("Enter a current or future review date in YYYY-MM-DD format");
 const existing=privateDocuments.get(requirement.title),version=(Number(existing?.version)||0)+1,bucket=window.FLORENCE_CONFIG.storageBucket;
 const storagePath=`${currentProfile.organisation_id}/controlled-library/${requirement.key}-v${version}-${Date.now()}.pdf`;
 const {error:uploadError}=await db.storage.from(bucket).upload(storagePath,file,{contentType:"application/pdf",upsert:false});
 if(uploadError)throw uploadError;
 const payload={organisation_id:currentProfile.organisation_id,scope:"Organisation",subject_type:"organisation",subject_name:"I-Care Connect",category:"Controlled library",title:requirement.title,catalogue_key:requirement.key,module:requirement.module,requirement_level:requirement.requirement,access_level:requirement.access,lifecycle_status:"Draft",effective_date:new Date().toISOString().slice(0,10),review_date:reviewDate,storage_path:storagePath,original_filename:file.name,mime_type:"application/pdf",version,uploaded_by:currentProfile.id,uploaded_at:new Date().toISOString()};
 const {error}=await db.from("compliance_documents").insert(payload);
 if(error){await db.storage.from(bucket).remove([storagePath]).catch(()=>{});throw error}
 await loadPrivateDocuments();renderTemplates();renderResources();toast("New controlled-document version uploaded for approval")
}
async function approveControlledDocument(documentId){
 if(currentProfile?.role!=="supervisor")throw new Error("Only a supervisor can approve controlled documents");
 const document=[...privateDocuments.values()].find(item=>item.id===documentId);
 if(!document)throw new Error("Controlled document not found");
 const entered=prompt("Confirm the next review date (YYYY-MM-DD)",document.review_date||"");
 if(entered===null)return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(entered)||new Date(`${entered}T00:00:00`)<new Date(new Date().toISOString().slice(0,10)+"T00:00:00"))throw new Error("Enter a current or future review date in YYYY-MM-DD format");
 const {error}=await db.rpc("approve_controlled_document",{p_document_id:documentId,p_review_date:entered,p_effective_date:document.effective_date||new Date().toISOString().slice(0,10)});
 if(error)throw error;
 await loadPrivateDocuments();renderTemplates();renderResources();toast("Controlled document approved")
}
async function approveAllControlledDocuments(){
 if(currentProfile?.role!=="supervisor")throw new Error("Only a supervisor can approve controlled documents");
 const drafts=[...privateDocuments.values()].filter(document=>document.lifecycle_status!=="Approved");
 if(!drafts.length){toast("All controlled documents are already approved");return}
 const suggested=new Date();suggested.setFullYear(suggested.getFullYear()+1);
 const reviewDate=prompt(`Confirm the next review date for all ${drafts.length} documents (YYYY-MM-DD)`,suggested.toISOString().slice(0,10));
 if(reviewDate===null)return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)||new Date(`${reviewDate}T00:00:00`)<new Date(new Date().toISOString().slice(0,10)+"T00:00:00"))throw new Error("Enter a current or future review date in YYYY-MM-DD format");
 if(!confirm(`I confirm I have reviewed these ${drafts.length} controlled documents, they accurately reflect I-Care Connect's current practices, and I approve them with a next review date of ${reviewDate}.`))return;
 const button=$("#sil-approve-all-documents"),status=$("#sil-bulk-approval-status");
 button.disabled=true;status.classList.remove("hidden");
 let approved=0;
 try{
  for(const document of drafts){
   status.textContent=`Approving ${approved+1} of ${drafts.length}: ${document.title}`;
   const {error}=await db.rpc("approve_controlled_document",{p_document_id:document.id,p_review_date:reviewDate,p_effective_date:document.effective_date||new Date().toISOString().slice(0,10)});
   if(error)throw new Error(`${approved} documents were approved before Florence stopped at ${document.title}: ${error.message}`);
   approved++;
  }
  status.textContent=`Success — ${approved} controlled documents approved. Each document has its own supervisor approval record.`;
  toast(`${approved} controlled documents approved`)
 }finally{
  await loadPrivateDocuments();renderTemplates();renderResources();button.disabled=false
 }
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
  const approvedCounts=new Map([[1,44],[2,controlledDocuments.length]]),expectedCount=approvedCounts.get(manifest.version);
  if(manifest.format!=="florence-controlled-library"||!expectedCount||manifest.document_count!==expectedCount||!Array.isArray(manifest.documents)||manifest.documents.length!==expectedCount)throw new Error("This is not an approved Florence controlled-library ZIP");
  const requirementsByTitle=new Map(controlledDocuments.map(document=>[document.title,document]));
  const bucket=window.FLORENCE_CONFIG.storageBucket;
  for(let index=0;index<manifest.documents.length;index++){
   const document=manifest.documents[index];
   const requirement=requirementsByTitle.get(document.title);
   if(!requirement)throw new Error(`Unexpected document in ZIP: ${document.title}`);
   const entry=archive.file(document.filename);
   if(!entry)throw new Error(`Missing PDF in ZIP: ${document.filename}`);
   status.textContent=`Installing private PDF ${index+1} of ${manifest.documents.length}: ${document.title}`;
   const bytes=await entry.async("arraybuffer");
   if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")throw new Error(`Invalid PDF content for ${document.title}`);
   if(document.sha256&&await sha256Hex(bytes)!==document.sha256)throw new Error(`Integrity check failed for ${document.title}`);
   const existing=privateDocuments.get(document.title),version=(Number(existing?.version)||0)+1;
   const storagePath=`${currentProfile.organisation_id}/controlled-library/${requirement.key}-v${version}-${Date.now()}.pdf`;
   const blob=new Blob([bytes],{type:"application/pdf"});
   const {error:uploadError}=await db.storage.from(bucket).upload(storagePath,blob,{contentType:"application/pdf",upsert:false});
   if(uploadError)throw uploadError;
   const payload={organisation_id:currentProfile.organisation_id,scope:"Organisation",subject_type:"organisation",subject_name:"I-Care Connect",category:"Controlled library",title:document.title,catalogue_key:requirement.key,module:requirement.module,requirement_level:requirement.requirement,access_level:requirement.access,lifecycle_status:"Draft",storage_path:storagePath,original_filename:document.filename,mime_type:"application/pdf",version,uploaded_by:currentProfile.id,uploaded_at:new Date().toISOString()};
   const result=await db.from("compliance_documents").insert(payload);
   if(result.error){await db.storage.from(bucket).remove([storagePath]).catch(()=>{});throw result.error}
  }
  await loadPrivateDocuments();
  renderTemplates();renderResources();
  status.textContent=`Success — ${manifest.documents.length} private PDF copies were installed as drafts. A supervisor must verify control dates and approve each document before worker access.`;
  toast("Private controlled documents installed for review")
 }finally{
  button.disabled=false;
  delete status.dataset.progress;
  $("#sil-library-zip").value="";
 }
}
function renderEvidence(){const cat=$("#sil-filter-category"),current=cat.value,cats=[...new Set(state.records.map(r=>r.category))].sort();cat.innerHTML='<option value="all">All categories</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join("");cat.value=cats.includes(current)?current:"all";const q=$("#sil-filter-search").value.toLowerCase(),st=$("#sil-filter-status").value,ca=cat.value;const rows=state.records.filter(r=>(ca==="all"||r.category===ca)&&(st==="all"||statusOf(r)===st)&&(!q||JSON.stringify(r).toLowerCase().includes(q)));$("#sil-evidence-list").innerHTML=rows.map(recordCard).join("")||'<div class="sil-empty">No matching evidence records.</div>'}
function exportFile(kind){
 const rows=state.records.map(record=>({id:record.id,category:record.category,title:record.title,status:statusOf(record),created_at:record.createdAt,...record.fields}));
 let blob,name;
 if(kind==="json"){
  blob=new Blob([JSON.stringify({provider:state.provider,records:rows,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});name="Florence-SIL-audit-evidence.json"
 }else{
  const keys=[...new Set(rows.flatMap(Object.keys))],csv=[keys.join(","),...rows.map(row=>keys.map(key=>'"'+String(row[key]??"").replaceAll('"','""')+'"').join(","))].join("\n");
  blob=new Blob([csv],{type:"text/csv"});name="Florence-SIL-audit-evidence.csv"
 }
 void auditSilAccess("EXPORT","sil_records",null,{format:kind,record_count:rows.length});
 const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=name;link.click();URL.revokeObjectURL(link.href)
}
function exportAuditChecklist(){
 const controlled=controlledDocuments.map(requirement=>{const state=controlledDocumentState(requirement),document=state.document;return{section:"Controlled document",module:requirement.module,requirement:requirement.requirement,title:requirement.title,status:state.label,version:document?.version||"",review_date:document?.review_date||"",location:"Private controlled library",notes:requirement.description}});
 const evidence=AUDIT_CATALOGUE.evidence.map(item=>{const check=evidenceChecks.get(item.key)||{};return{section:"Live audit evidence",module:item.module,requirement:item.requirement,title:item.title,status:check.status||"Not checked",version:"",review_date:check.reviewed_at||"",location:item.location,notes:check.notes||item.detail}});
 const rows=[...controlled,...evidence],keys=["section","module","requirement","title","status","version","review_date","location","notes"],csv=[keys.join(","),...rows.map(row=>keys.map(key=>'"'+String(row[key]??"").replaceAll('"','""')+'"').join(","))].join("\n");
 const blob=new Blob([csv],{type:"text/csv"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=`Florence-Core-Module-5A-audit-checklist-${new Date().toISOString().slice(0,10)}.csv`;link.click();URL.revokeObjectURL(link.href);void auditSilAccess("EXPORT","audit_evidence_checks",null,{format:"csv",controlled_requirements:controlled.length,evidence_checks:evidence.length})
}
function activateTab(tab){
 const button=$(`[data-sil-tab="${tab}"]`);if(!button)return;
 activeTab=tab;$$('[data-sil-tab]').forEach(item=>item.classList.toggle("active",item===button));$$('.sil-panel').forEach(panel=>panel.classList.toggle("active",panel.id===`sil-${activeTab}-panel`));if(activeTab==="evidence")renderEvidence();window.scrollTo({top:0,behavior:"smooth"})
}
$$('[data-sil-tab]').forEach(button=>button.onclick=()=>activateTab(button.dataset.silTab));
$$('[data-open-form]').forEach(button=>button.onclick=()=>openForm(button.dataset.openForm));
$("#edit-provider").onclick=()=>{openForm("provider");setTimeout(()=>Object.entries(state.provider||PROVIDER).forEach(([key,value])=>{const input=$(`[name="${key}"]`);if(input)input.value=value}),0)};
$("#sil-form").onsubmit=event=>void submit(event);
$("#sil-dialog-close").onclick=closeForm;$("#sil-dialog-cancel").onclick=closeForm;
$("#sil-participant-template-close")?.addEventListener("click",closeParticipantTemplate);
$("#sil-participant-template-cancel")?.addEventListener("click",closeParticipantTemplate);
$("#sil-participant-template-download")?.addEventListener("click",()=>void createParticipantWorkingCopy().catch(error=>toast(error.message)));
$("#sil-participant-template-upload")?.addEventListener("click",()=>$("#sil-participant-template-file")?.click());
$("#sil-participant-template-file")?.addEventListener("change",event=>{const file=event.target.files?.[0];if(file)void uploadCompletedParticipantTemplate(file).catch(error=>toast(error.message))});
$("#sil-refresh").onclick=async()=>{try{await Promise.all([loadSilState(),loadPrivateDocuments(),loadEvidenceChecks()]);render();toast("SIL workspace refreshed")}catch(error){toast(error.message||"Florence could not refresh SIL records")}};
$("#sil-import-library")?.addEventListener("click",()=>$("#sil-library-zip")?.click());
$("#sil-library-zip")?.addEventListener("change",event=>{const file=event.target.files?.[0];if(file)void importPrivateLibrary(file).catch(error=>{const status=$("#sil-library-import-status");if(status)status.textContent=error.message||"The private library could not be installed";toast(error.message||"The private library could not be installed")})});
$("#sil-approve-all-documents")?.addEventListener("click",()=>void approveAllControlledDocuments().catch(error=>{const status=$("#sil-bulk-approval-status");if(status){status.classList.remove("hidden");status.textContent=error.message}toast(error.message)}));
$("#sil-controlled-document-file")?.addEventListener("change",event=>{
 const file=event.target.files?.[0],requirement=controlledDocuments.find(document=>document.key===pendingControlledUpload);
 pendingControlledUpload=null;event.target.value="";
 if(!file||!requirement)return;
 const reviewDate=prompt(`Next review date for ${requirement.title} (YYYY-MM-DD)`,new Date(Date.now()+31536000000).toISOString().slice(0,10));
 if(reviewDate===null)return;
 void uploadControlledDocument(requirement,file,reviewDate).catch(error=>toast(error.message||"The controlled document could not be uploaded"));
});
$("#sil-export-json").onclick=()=>exportFile("json");$("#sil-export-csv").onclick=()=>exportFile("csv");
$("#sil-export-audit-checklist")?.addEventListener("click",exportAuditChecklist);
["#sil-filter-category","#sil-filter-status","#sil-filter-search"].forEach(selector=>$(selector).addEventListener(selector.includes("search")?"input":"change",renderEvidence));
async function archiveSilRecord(recordId){
 if(currentProfile?.role!=="supervisor")throw new Error("Only a supervisor can archive SIL records");
 const {error}=await db.from("sil_records").update({status:"Archived",archived_by:currentProfile.id,archived_at:new Date().toISOString(),updated_by:currentProfile.id}).eq("id",recordId).eq("organisation_id",currentProfile.organisation_id);
 if(error)throw error;
 await loadSilState();render();toast("SIL record archived with its audit history retained")
}
document.addEventListener("click",event=>{
 const participantForm=event.target.closest("[data-open-participant-form]");
 if(participantForm){
  const url=new URL(location.href);url.searchParams.set("participant",participantForm.dataset.participant);history.replaceState({},"",url);openForm(participantForm.dataset.openParticipantForm);return
 }
 const privateButton=event.target.closest("[data-open-private-document]");
 if(privateButton){void openPrivateDocument(privateButton.dataset.openPrivateDocument);return}
 const participantTemplateButton=event.target.closest("[data-use-participant-template]");
 if(participantTemplateButton){try{openParticipantTemplate(participantTemplateButton.dataset.useParticipantTemplate)}catch(error){toast(error.message)}return}
 const uploadButton=event.target.closest("[data-upload-controlled-document]");
 if(uploadButton){pendingControlledUpload=uploadButton.dataset.uploadControlledDocument;$("#sil-controlled-document-file")?.click();return}
 const approveButton=event.target.closest("[data-approve-controlled-document]");
 if(approveButton){void approveControlledDocument(approveButton.dataset.approveControlledDocument).catch(error=>toast(error.message));return}
 const evidenceButton=event.target.closest("[data-save-evidence-check]");
 if(evidenceButton){void saveEvidenceCheck(evidenceButton.dataset.saveEvidenceCheck).catch(error=>toast(error.message));return}
 const archiveButton=event.target.closest("[data-archive-record]");
 if(archiveButton){event.stopPropagation();if(confirm("Archive this SIL record? It will remain in the secure audit history."))void archiveSilRecord(archiveButton.dataset.archiveRecord).catch(error=>toast(error.message));return}
});
async function authorise(){
 try{
  if(!window.supabase||!window.FLORENCE_CONFIG?.supabaseUrl||!window.FLORENCE_CONFIG?.supabaseAnonKey)throw new Error("Florence configuration is unavailable.");
  db=window.supabase.createClient(window.FLORENCE_CONFIG.supabaseUrl,window.FLORENCE_CONFIG.supabaseAnonKey);
  const sessionResult=await db.auth.getSession();
  if(sessionResult.error)throw sessionResult.error;
  let session=sessionResult.data.session;
  if(!session){redirectThroughFlorence("sign-in-required");return}
  const refreshed=await db.auth.refreshSession();
  if(!refreshed.error&&refreshed.data.session)session=refreshed.data.session;
  const {data:aal,error:aalError}=await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aalError)throw aalError;
  if(aal?.currentLevel!=="aal2"){redirectThroughFlorence("mfa-required");return}
  const {data,error}=await db.from("profiles").select("id,full_name,role,active,organisation_id").eq("id",session.user.id).single();
  if(error)throw error;
  if(!data?.active)throw new Error("Your Florence account is inactive.");
  if(!["staff","supervisor"].includes(data.role))throw new Error("This account has portal access only and cannot open staff or SIL records.");
  currentProfile=data;
  const supervisor=data.role==="supervisor";
  $('[data-sil-tab="provider"]')?.classList.toggle("hidden",!supervisor);
  $("#sil-provider-panel")?.classList.toggle("hidden",!supervisor);
  $("#sil-library-import-panel")?.classList.toggle("hidden",!supervisor);
  $$('[data-open-form]').forEach(button=>button.classList.toggle("hidden",!supervisor&&!workerCreateRecordTypes.has(button.dataset.openForm)));
  try{localStorage.removeItem("florence-sil-v1")}catch(_ignored){}
  await Promise.all([loadSilState(),loadPrivateDocuments(),loadEvidenceChecks()]);
  render();
  document.documentElement.classList.remove("sil-auth-pending");
  try{sessionStorage.removeItem("florence:return-to")}catch(_ignored){}
  const params=new URL(location.href).searchParams,requestedTab=params.get("tab"),requestedForm=params.get("form"),requestedRecord=params.get("record");
  if(requestedRecord){location.replace(evidenceUrl(requestedRecord));return}
  if(requestedTab)activateTab(requestedTab);
  if(requestedForm&&schemas[requestedForm])setTimeout(()=>openForm(requestedForm),0);
 }catch(error){
  console.error("SIL access check failed",error);
  showSilStartupError(error);
 }
}
authorise();
})();
