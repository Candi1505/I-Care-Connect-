(()=>{
"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
document.documentElement.classList.add("sil-auth-pending");
let db=null,currentProfile=null;
let directory={participants:[],staff:[]};
const participantRecordTypes=new Set(["visitor","supportPlan","emergencyPlan","riskAssessment","intake","communication","instructions","choice","agreementExplanation","serviceAgreement","rights","privateSpace","handover"]);
const workerRecordTypes=new Set(["induction","competency","training","observation"]);
const workerCreateRecordTypes=new Set(["visitor","choice","handover"]);
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
 const [recordsResult,providerResult,participantsResult,staffResult]=await Promise.all([
  db.from("sil_records").select("*").eq("organisation_id",org).is("archived_at",null).order("created_at",{ascending:false}),
  db.from("sil_provider_profiles").select("profile").eq("organisation_id",org).maybeSingle(),
  db.from("participants").select("id,full_name,preferred_name").eq("organisation_id",org).order("full_name"),
  db.from("profiles").select("id,full_name,role,active").eq("organisation_id",org).eq("active",true).in("role",["staff","supervisor"]).order("full_name")
 ]);
 const failed=[recordsResult,providerResult,participantsResult,staffResult].find(result=>result.error);
 if(failed)throw failed.error;
 state.records=(recordsResult.data||[]).map(rowToRecord);
 state.provider={...PROVIDER,...(providerResult.data?.profile||{})};
 directory={participants:participantsResult.data||[],staff:staffResult.data||[]};
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
function closeRecord(){const dialog=$("#sil-record-dialog");dialog.close?dialog.close():dialog.removeAttribute("open")}
function openRecord(recordId){
 const record=state.records.find(item=>item.id===recordId);
 if(!record){toast("That completed SIL record is no longer available");return}
 $("#sil-record-detail-title").textContent=record.title;
 $("#sil-record-detail-meta").innerHTML=`${badge(statusOf(record))}${badge(participantName(record.participant_id))}${badge(fmt(record.createdAt))}`;
 const entries=Object.entries(record.fields||{}).filter(([,value])=>value!==null&&value!==undefined&&value!=="");
 $("#sil-record-detail-fields").innerHTML=entries.map(([key,value])=>`<dt>${esc(fieldLabel(record,key))}</dt><dd>${esc(value)}</dd>`).join("")||"<dt>Record</dt><dd>No form fields were stored.</dd>";
 void auditSilAccess("READ","sil_records",record.id,{record_type:record.type,source:"audit_evidence"});
 const dialog=$("#sil-record-dialog");dialog.showModal?dialog.showModal():dialog.setAttribute("open","")
}
async function submit(event){
 event.preventDefault();
 const formElement=event.currentTarget,type=formElement.dataset.type,schema=schemas[type];
 const submitButton=formElement.querySelector('button[type="submit"]');
 if(!schema)return;
 submitButton.disabled=true;submitButton.textContent="Saving securely…";
 try{
  const values=Object.fromEntries(new FormData(formElement));
  if(type==="provider"){
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
 return`<article class="record sil-evidence-record${risk}" data-open-record="${r.id}"><div class="record-top"><div><h3><button type="button" class="link sil-record-title-button" data-open-record-button="${r.id}">${esc(r.title)}</button></h3><p>${esc(r.category)} · ${fmt(r.createdAt)}</p></div>${badge(statusOf(r))}</div><p>${entries.map(([key,value])=>`<strong>${esc(fieldLabel(r,key))}:</strong> ${esc(value)}`).join("<br>")}</p><div class="sil-record-actions"><button type="button" class="link" data-open-record-button="${r.id}">View completed form</button>${archive}</div></article>`
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
$("#sil-shift-list").innerHTML=recs.filter(r=>["Shift handover","Supported decision-making","Visitors"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">No SIL shift records.</div>';
$("#sil-worker-list").innerHTML=recs.filter(r=>["Worker induction","Worker competency","Worker training","Practice observation"].includes(r.category)).map(recordCard).join("")||'<div class="sil-empty">No SIL workforce records.</div>';
renderReadiness();renderProvider();renderTemplates();renderResources();renderEvidence();
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
function activateTab(tab){
 const button=$(`[data-sil-tab="${tab}"]`);if(!button)return;
 activeTab=tab;$$('[data-sil-tab]').forEach(item=>item.classList.toggle("active",item===button));$$('.sil-panel').forEach(panel=>panel.classList.toggle("active",panel.id===`sil-${activeTab}-panel`));if(activeTab==="evidence")renderEvidence();window.scrollTo({top:0,behavior:"smooth"})
}
$$('[data-sil-tab]').forEach(button=>button.onclick=()=>activateTab(button.dataset.silTab));
$$('[data-open-form]').forEach(button=>button.onclick=()=>openForm(button.dataset.openForm));
$("#edit-provider").onclick=()=>{openForm("provider");setTimeout(()=>Object.entries(state.provider||PROVIDER).forEach(([key,value])=>{const input=$(`[name="${key}"]`);if(input)input.value=value}),0)};
$("#sil-form").onsubmit=event=>void submit(event);
$("#sil-dialog-close").onclick=closeForm;$("#sil-dialog-cancel").onclick=closeForm;
$("#sil-record-detail-close").onclick=closeRecord;$("#sil-record-detail-done").onclick=closeRecord;
$("#sil-refresh").onclick=async()=>{try{await loadSilState();await loadPrivateDocuments();render();toast("SIL workspace refreshed")}catch(error){toast(error.message||"Florence could not refresh SIL records")}};
$("#sil-import-library")?.addEventListener("click",()=>$("#sil-library-zip")?.click());
$("#sil-library-zip")?.addEventListener("change",event=>{const file=event.target.files?.[0];if(file)void importPrivateLibrary(file).catch(error=>{const status=$("#sil-library-import-status");if(status)status.textContent=error.message||"The private library could not be installed";toast(error.message||"The private library could not be installed")})});
$("#sil-export-json").onclick=()=>exportFile("json");$("#sil-export-csv").onclick=()=>exportFile("csv");
["#sil-filter-category","#sil-filter-status","#sil-filter-search"].forEach(selector=>$(selector).addEventListener(selector.includes("search")?"input":"change",renderEvidence));
async function archiveSilRecord(recordId){
 if(currentProfile?.role!=="supervisor")throw new Error("Only a supervisor can archive SIL records");
 const {error}=await db.from("sil_records").update({status:"Archived",archived_by:currentProfile.id,archived_at:new Date().toISOString(),updated_by:currentProfile.id}).eq("id",recordId).eq("organisation_id",currentProfile.organisation_id);
 if(error)throw error;
 await loadSilState();render();toast("SIL record archived with its audit history retained")
}
document.addEventListener("click",event=>{
 const openButton=event.target.closest("[data-open-record-button]");
 if(openButton){event.stopPropagation();openRecord(openButton.dataset.openRecordButton);return}
 const participantForm=event.target.closest("[data-open-participant-form]");
 if(participantForm){
  const url=new URL(location.href);url.searchParams.set("participant",participantForm.dataset.participant);history.replaceState({},"",url);openForm(participantForm.dataset.openParticipantForm);return
 }
 const privateButton=event.target.closest("[data-open-private-document]");
 if(privateButton){void openPrivateDocument(privateButton.dataset.openPrivateDocument);return}
 const archiveButton=event.target.closest("[data-archive-record]");
 if(archiveButton){event.stopPropagation();if(confirm("Archive this SIL record? It will remain in the secure audit history."))void archiveSilRecord(archiveButton.dataset.archiveRecord).catch(error=>toast(error.message));return}
 const recordCard=event.target.closest("[data-open-record]");
 if(recordCard)openRecord(recordCard.dataset.openRecord)
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
  await Promise.all([loadSilState(),loadPrivateDocuments()]);
  render();
  document.documentElement.classList.remove("sil-auth-pending");
  try{sessionStorage.removeItem("florence:return-to")}catch(_ignored){}
  const params=new URL(location.href).searchParams,requestedTab=params.get("tab"),requestedForm=params.get("form"),requestedRecord=params.get("record");
  if(requestedTab)activateTab(requestedTab);
  if(requestedForm&&schemas[requestedForm])setTimeout(()=>openForm(requestedForm),0);
  if(requestedRecord)setTimeout(()=>openRecord(requestedRecord),0);
 }catch(error){
  console.error("SIL access check failed",error);
  showSilStartupError(error);
 }
}
authorise();
})();
