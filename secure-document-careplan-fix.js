(()=>{
"use strict";
const q=(s,r=document)=>r.querySelector(s);
const B=()=>window.FlorenceBridge;
const C=()=>window.FLORENCE_CONFIG||{};
let enhancing=false;
function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600)}
async function openSecureDocument(documentId){
 const b=B();if(!b?.db||!documentId)throw new Error("Florence is still loading the secure document service.");
 const {data:documentRecord,error:recordError}=await b.db.from("compliance_documents").select("id,title,scope,storage_path").eq("id",documentId).single();
 if(recordError||!documentRecord)throw recordError||new Error("Document record not found");
 await b.auditAccess?.("DOWNLOAD","compliance_documents",documentRecord.id,{title:documentRecord.title,scope:documentRecord.scope});
 const {data,error}=await b.db.storage.from(C().storageBucket).createSignedUrl(documentRecord.storage_path,120);
 if(error||!data?.signedUrl)throw error||new Error("Florence could not create the secure document link");
 location.assign(data.signedUrl);
}
async function activeParticipantId(){
 const select=q("#pf-select");
 if(select?.value)return select.value;
 const b=B();return b?.profile?.participant_id||"";
}
async function enhanceCarePlan(){
 if(enhancing)return;
 const active=q('[data-pf-tab="care"].active');
 const body=q("#pf-content .pf-body");
 const b=B();
 if(!active||!body||!b?.db||q("#pf-care-document-status"))return;
 enhancing=true;
 try{
  const participantId=await activeParticipantId();if(!participantId)return;
  const {data,error}=await b.db.from("compliance_documents")
   .select("id,title,original_filename,review_date,uploaded_at")
   .eq("scope","Participant")
   .eq("subject_id",participantId)
   .eq("category","Care plan")
   .order("uploaded_at",{ascending:false})
   .limit(1)
   .maybeSingle();
  if(error)throw error;
  const panel=document.createElement("article");
  panel.id="pf-care-document-status";
  panel.className="panel pf-care-document-status";
  if(data){
   const review=data.review_date?new Intl.DateTimeFormat("en-AU",{day:"numeric",month:"short",year:"numeric"}).format(new Date(`${data.review_date}T12:00:00`)):"Not recorded";
   panel.innerHTML=`<div class="panel-head"><div><p class="eyebrow">Uploaded care plan</p><h3>${escapeHtml(data.title||"Participant care plan")}</h3><p>${escapeHtml(data.original_filename||"PDF care plan")} · Review ${escapeHtml(review)}</p></div><span class="badge good">PDF recorded</span></div><p>The PDF is stored securely. The summary fields below are separate at-a-glance information and are not automatically extracted from the PDF.</p><button type="button" class="secondary" data-secure-care-doc="${data.id}">Open care plan securely</button>`;
  }else{
   panel.innerHTML='<div class="panel-head"><div><p class="eyebrow">Uploaded care plan</p><h3>No PDF care plan recorded</h3></div><span class="badge amber">Missing</span></div>';
  }
  body.prepend(panel);
 }catch(error){console.warn("Florence care plan document status unavailable",error?.message||error)}finally{enhancing=false}
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]))}
document.addEventListener("click",event=>{
 const target=event.target instanceof Element?event.target:null;
 const complianceButton=target?.closest("[data-open-doc]");
 const careButton=target?.closest("[data-secure-care-doc]");
 const button=careButton||complianceButton;
 if(button){
  event.preventDefault();event.stopImmediatePropagation();
  const id=button.dataset.secureCareDoc||button.dataset.openDoc;
  button.disabled=true;
  const original=button.textContent;button.textContent="Opening securely…";
  void openSecureDocument(id).catch(error=>{toast(error?.message||"Florence could not open this document");button.disabled=false;button.textContent=original});
  return;
 }
 if(target?.closest('[data-pf-tab="care"]'))setTimeout(()=>void enhanceCarePlan(),80);
},true);
const observer=new MutationObserver(()=>void enhanceCarePlan());
function start(){const host=q("#pf-content");if(host&&!host.__careDocumentObserved){observer.observe(host,{childList:true,subtree:true});host.__careDocumentObserved=true}void enhanceCarePlan()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
window.addEventListener("florence:ready",start);window.addEventListener("pageshow",start);
setInterval(start,1500);
const style=document.createElement("style");style.textContent='.pf-care-document-status{margin-bottom:16px}.pf-care-document-status .panel-head{align-items:flex-start}.pf-care-document-status button{margin-top:8px}';document.head.appendChild(style);
})();
