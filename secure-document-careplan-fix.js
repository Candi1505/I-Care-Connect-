(()=>{
"use strict";
const q=(s,r=document)=>r.querySelector(s);
const B=()=>window.FlorenceBridge;
const C=()=>window.FLORENCE_CONFIG||{};
let enhancing=false;
function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]))}
function formatDate(value){return value?new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${String(value).slice(0,10)}T12:00:00`)):"Not recorded"}
async function openSecureDocument(documentId){
 const b=B();if(!b?.db||!documentId)throw new Error("Florence is still loading the secure document service.");
 const {data:documentRecord,error:recordError}=await b.db.from("compliance_documents").select("id,title,scope,storage_path").eq("id",documentId).single();
 if(recordError||!documentRecord)throw recordError||new Error("Document record not found");
 await b.auditAccess?.("DOWNLOAD","compliance_documents",documentRecord.id,{title:documentRecord.title,scope:documentRecord.scope});
 const {data,error}=await b.db.storage.from(C().storageBucket).createSignedUrl(documentRecord.storage_path,300,{download:false});
 if(error||!data?.signedUrl)throw error||new Error("Florence could not create the secure document link");
 const anchor=document.createElement("a");
 anchor.href=data.signedUrl;
 anchor.target="_self";
 anchor.rel="noopener";
 anchor.style.display="none";
 document.body.appendChild(anchor);
 anchor.click();
 setTimeout(()=>{if(document.body.contains(anchor))anchor.remove();if(location.href!==data.signedUrl)location.href=data.signedUrl},50);
}
function activeParticipantId(){const select=q("#pf-select");return select?.value||B()?.profile?.participant_id||""}
async function approveCarePlan(participantId,button){
 const b=B();
 if(!b?.db||!b?.profile)throw new Error("Florence is still loading your supervisor account.");
 if(b.profile.role!=="supervisor")throw new Error("Only a supervisor can approve a care plan.");
 if(!confirm("Approve this participant care plan as the current version?"))return;
 button.disabled=true;const original=button.textContent;button.textContent="Approving…";
 const approvedAt=new Date().toISOString();
 const {error}=await b.db.from("participants").update({care_plan_approved_by:b.profile.id,care_plan_approved_at:approvedAt,updated_at:approvedAt}).eq("id",participantId);
 if(error){button.disabled=false;button.textContent=original;throw error}
 toast("Care plan approved");
 setTimeout(()=>location.reload(),500);
}
async function enhanceCarePlan(){
 if(enhancing)return;
 const active=q('[data-pf-tab="care"].active');
 const body=q("#pf-content .pf-body");
 const b=B();
 if(!active||!body||!b?.db)return;
 enhancing=true;
 try{
  const participantId=activeParticipantId();if(!participantId)return;
  const [{data:documentRecord,error:documentError},{data:participant,error:participantError}]=await Promise.all([
   b.db.from("compliance_documents").select("id,title,original_filename,review_date,uploaded_at").eq("scope","Participant").eq("subject_id",participantId).eq("category","Care plan").order("uploaded_at",{ascending:false}).limit(1).maybeSingle(),
   b.db.from("participants").select("id,care_plan_version,care_plan_effective_from,care_plan_review_date,care_plan_approved_at,care_plan_approved_by").eq("id",participantId).single()
  ]);
  if(documentError)throw documentError;if(participantError)throw participantError;
  q("#pf-care-document-status")?.remove();
  const panel=document.createElement("article");panel.id="pf-care-document-status";panel.className="panel pf-care-document-status";
  if(documentRecord){
   const approved=Boolean(participant?.care_plan_approved_at),isSupervisor=b.profile.role==="supervisor";
   panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Uploaded care plan</p><h3>${escapeHtml(documentRecord.title||"Participant care plan")}</h3><p>${escapeHtml(documentRecord.original_filename||"PDF care plan")} · Review ${escapeHtml(formatDate(documentRecord.review_date))}</p></div><span class="badge good">PDF recorded</span></div><div class="record-meta care-plan-version"><span>Version ${Number(participant?.care_plan_version||1)}</span><span>Effective ${escapeHtml(formatDate(participant?.care_plan_effective_from))}</span><span>Review ${escapeHtml(formatDate(participant?.care_plan_review_date))}</span></div><p>The PDF is stored securely. The summary fields below are separate at-a-glance information and are not automatically extracted from the PDF.</p><div class="actions"><button type="button" class="secondary" data-secure-care-doc="${documentRecord.id}">Open care plan securely</button>${approved?'<span class="badge good">Approved</span>':isSupervisor?`<button type="button" class="primary" data-approve-care-plan="${participantId}">Approve care plan</button>`:'<span class="badge amber">Approval pending</span>'}</div>`;
  }else{
   panel.innerHTML='<div class="panel-head"><div><p class="eyebrow">Uploaded care plan</p><h3>No PDF care plan recorded</h3></div><span class="badge amber">Missing</span></div>';
  }
  body.prepend(panel);
 }catch(error){console.warn("Florence care plan document status unavailable",error?.message||error)}finally{enhancing=false}
}
document.addEventListener("click",event=>{
 const target=event.target instanceof Element?event.target:null;
 const approveButton=target?.closest("[data-approve-care-plan]");
 if(approveButton){event.preventDefault();event.stopImmediatePropagation();void approveCarePlan(approveButton.dataset.approveCarePlan,approveButton).catch(error=>toast(error?.message||"Florence could not approve this care plan"));return}
 const complianceButton=target?.closest("[data-open-doc]");
 const careButton=target?.closest("[data-secure-care-doc]");
 const button=careButton||complianceButton;
 if(button){event.preventDefault();event.stopImmediatePropagation();const id=button.dataset.secureCareDoc||button.dataset.openDoc;button.disabled=true;const original=button.textContent;button.textContent="Opening securely…";void openSecureDocument(id).catch(error=>{toast(error?.message||"Florence could not open this document");button.disabled=false;button.textContent=original});return}
 if(target?.closest('[data-pf-tab="care"]'))setTimeout(()=>void enhanceCarePlan(),80);
},true);
const observer=new MutationObserver(()=>void enhanceCarePlan());
function start(){const host=q("#pf-content");if(host&&!host.__careDocumentObserved){observer.observe(host,{childList:true,subtree:true});host.__careDocumentObserved=true}void enhanceCarePlan()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("florence:ready",start);window.addEventListener("pageshow",start);
const style=document.createElement("style");style.textContent='.pf-care-document-status{margin-bottom:16px}.pf-care-document-status .panel-head{align-items:flex-start}.pf-care-document-status .actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px}.pf-care-document-status .care-plan-version{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0 12px}';document.head.appendChild(style);
})();
