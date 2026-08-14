(()=>{
"use strict";
const $=selector=>document.querySelector(selector);
const DOMESTIC_TASK_LABELS={"kitchen_benches":"Kitchen — benches and surfaces","kitchen_sink":"Kitchen — sink and taps","kitchen_cooktop":"Kitchen — cooktop and splashback","kitchen_appliances":"Kitchen — appliance exteriors","kitchen_microwave":"Kitchen — microwave","kitchen_fridge":"Kitchen — fridge spills and expired food","kitchen_cupboards":"Kitchen — cupboard fronts and touchpoints","kitchen_dishes":"Kitchen — dishes or dishwasher","kitchen_floor_dry":"Kitchen — swept or vacuumed","kitchen_floor_mop":"Kitchen — hard floor mopped","kitchen_bins":"Kitchen — bins","bathroom_toilet":"Bathroom — toilet","bathroom_basin":"Bathroom — basin and taps","bathroom_shower":"Bathroom — shower or bath","bathroom_mirror":"Bathroom — mirrors","bathroom_floor":"Bathroom — floor","bathroom_bins":"Bathroom — bins","bathroom_supplies":"Bathroom — agreed supplies","living_dust":"Shared areas — dusted","living_touchpoints":"Shared areas — touchpoints","living_tidy":"Shared areas — tidied","living_vacuum":"Shared areas — carpets and rugs","living_mop":"Shared areas — hard floors","living_windows":"Shared areas — windows and internal glass","living_entry":"Shared areas — entry","bedroom_consent":"Private space — consent confirmed","bedroom_linen":"Private space — linen","bedroom_dust":"Private space — dusted","bedroom_floor":"Private space — floor","bedroom_bin":"Private space — bin","laundry_wash":"Laundry — washed","laundry_dry":"Laundry — dried","laundry_fold":"Laundry — folded","laundry_putaway":"Laundry — put away","laundry_area":"Laundry — area cleaned","laundry_lint":"Laundry — lint filter","safety_chemicals":"Safety — chemicals stored","safety_equipment":"Safety — equipment stored","safety_hazards":"Safety — hazards checked","safety_maintenance":"Safety — maintenance checked","safety_walkthrough":"Safety — final walk-through"};
const FIELD_LABELS={
 participant:"Participant",worker:"Worker",date:"Date and time",house:"SIL home",
 category:"Choice category",options:"Options discussed",decision:"Decision being made",
 choice:"Participant's own words and choice",support:"Decision-making support provided",
 risk:"Risks discussed and safeguards used",outcome:"Outcome",preference_change:"Preference change",
 plan_update:"Support-plan update",declaration:"Worker declaration",tasks:"Completed duties",task_count:"Duties completed",shift_date:"Date completed",participant_preferences:"Participant choices and preferences followed",not_completed_reason:"Not required or not completed",follow_up_required:"Follow-up required",pin_verified:"Signing PIN verified",signed_at:"Signed at"
};
function formatDate(value){
 if(!value)return"Not recorded";
 const parsed=new Date(value);
 return Number.isNaN(parsed.valueOf())?String(value):new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"long",year:"numeric",hour:"numeric",minute:"2-digit"}).format(parsed)
}
function labelFor(key){return FIELD_LABELS[key]||String(key).replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase())}
function redirectToSignIn(reason){
 try{sessionStorage.setItem("florence:sil-record-return",location.href)}catch(_ignored){}
 const target=new URL("index.html",location.href);target.searchParams.set("reason",reason);location.replace(target.toString())
}
function showError(title,message){
 $("#sil-record-loading").classList.add("hidden");
 $("#sil-record-content").classList.add("hidden");
 $("#sil-record-error-title").textContent=title;
 $("#sil-record-error-message").textContent=message;
 $("#sil-record-error").classList.remove("hidden");
 document.documentElement.classList.remove("sil-auth-pending")
}
function addMeta(text,kind="good"){
 const badge=document.createElement("span");badge.className=`badge ${kind}`;badge.textContent=text;$("#sil-record-meta").appendChild(badge)
}
function renderRecord(record,participantName){
 $("#sil-record-title").textContent=record.title||"Completed SIL record";
 $("#sil-record-category").textContent=record.category||"SIL evidence";
 $("#sil-record-status").textContent=record.status||"Complete";
 addMeta(participantName||"Participant");
 addMeta(`Recorded ${formatDate(record.created_at)}`);
 if(record.updated_at&&record.updated_at!==record.created_at)addMeta(`Updated ${formatDate(record.updated_at)}`,"amber");
 const fields=$("#sil-record-fields");
 const entries=Object.entries(record.fields||{}).filter(([,value])=>value!==null&&value!==undefined&&value!=="");
 for(const [key,value] of entries){
  const term=document.createElement("dt"),description=document.createElement("dd");
  term.textContent=labelFor(key);
  if(key==="tasks"&&value&&typeof value==="object"){
   const completed=Object.keys(value).filter(task=>value[task]===true);
   description.textContent=completed.map(task=>`✓ ${DOMESTIC_TASK_LABELS[task]||labelFor(task)}`).join("\n");
   description.classList.add("sil-task-evidence");
  }else description.textContent=Array.isArray(value)?value.join(", "):typeof value==="object"?JSON.stringify(value,null,2):String(value);
  fields.append(term,description)
 }
 if(!entries.length){const term=document.createElement("dt"),description=document.createElement("dd");term.textContent="Record";description.textContent="No form fields were stored.";fields.append(term,description)}
 $("#sil-record-loading").classList.add("hidden");
 $("#sil-record-content").classList.remove("hidden");
 document.documentElement.classList.remove("sil-auth-pending")
}
async function start(){
 try{
  if(!window.supabase||!window.FLORENCE_CONFIG?.supabaseUrl||!window.FLORENCE_CONFIG?.supabaseAnonKey)throw new Error("Florence configuration is unavailable.");
  const recordId=new URL(location.href).searchParams.get("id")||"";
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordId)){showError("Invalid evidence link","Return to Audit Evidence and open the record again.");return}
  const db=window.supabase.createClient(window.FLORENCE_CONFIG.supabaseUrl,window.FLORENCE_CONFIG.supabaseAnonKey);
  const sessionResult=await db.auth.getSession();if(sessionResult.error)throw sessionResult.error;
  let session=sessionResult.data.session;if(!session){redirectToSignIn("sign-in-required");return}
  const refreshed=await db.auth.refreshSession();if(!refreshed.error&&refreshed.data.session)session=refreshed.data.session;
  const {data:aal,error:aalError}=await db.auth.mfa.getAuthenticatorAssuranceLevel();if(aalError)throw aalError;
  if(aal?.currentLevel!=="aal2"){redirectToSignIn("mfa-required");return}
  const {data:profile,error:profileError}=await db.from("profiles").select("id,role,active,organisation_id").eq("id",session.user.id).single();
  if(profileError)throw profileError;
  if(!profile?.active||!["staff","supervisor"].includes(profile.role)){showError("Access unavailable","Your Florence account is not authorised to review staff or SIL records.");return}
  const {data:record,error:recordError}=await db.from("sil_records").select("id,organisation_id,participant_id,record_type,category,title,fields,status,created_at,updated_at").eq("id",recordId).eq("organisation_id",profile.organisation_id).maybeSingle();
  if(recordError)throw recordError;
  if(!record){showError("Record not found","The record may have been archived or your account may not be assigned to this participant.");return}
  let participantName="Participant";
  if(record.participant_id){
   const {data:participant}=await db.from("participants").select("full_name,preferred_name").eq("id",record.participant_id).maybeSingle();
   participantName=participant?.preferred_name||participant?.full_name||participantName
  }
  renderRecord(record,participantName);
  const {error:auditError}=await db.rpc("record_access_event",{p_action:"READ",p_table_name:"sil_records",p_record_id:record.id,p_metadata:{record_type:record.record_type,source:"dedicated_evidence_page"}});
  if(auditError)console.warn("Florence evidence audit event failed",auditError.message||auditError)
 }catch(error){console.error("Florence evidence viewer failed",error);showError("This record could not be opened",error?.message||"Return to Audit Evidence and try again.")}
}
start();
})();
