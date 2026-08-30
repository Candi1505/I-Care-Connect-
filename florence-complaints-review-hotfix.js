import { t as createClient } from "/assets/supabase-cjTLRNMm.js";

const db=createClient("https://pbbsaquwumxyrhqhnobv.supabase.co","sb_publishable_4D2Oc8FJjOXDXgGG7GbzfA_oYRpXSU5",{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:"florence-auth-session"}});
const portalRoles=new Set(["family","client"]);
let profile=null,enhanceTimer=null;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const fmt=v=>v?new Intl.DateTimeFormat("en-AU",{timeZone:"Australia/Brisbane",day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(v)):"Not yet";
const isSupervisor=()=>String(profile?.role||"").toLowerCase()==="supervisor";
const isPortalUser=()=>portalRoles.has(String(profile?.role||"").toLowerCase());

async function getProfile(){
 if(profile)return profile;
 const {data:{session}}=await db.auth.getSession();if(!session?.user?.id)return null;
 const {data,error}=await db.from("profiles").select("id,organisation_id,participant_id,full_name,email,role,active").eq("id",session.user.id).maybeSingle();
 if(error||!data?.active)return null;profile=data;return profile;
}
function toast(message){const n=document.createElement("div");n.className="toast florence-hotfix-toast";n.textContent=message;document.body.appendChild(n);setTimeout(()=>n.remove(),3200)}
function close(id){document.getElementById(id)?.remove()}
async function complaints(){
 const p=await getProfile();if(!p)return[];
 const {data,error}=await db.from("complaints").select("id,participant_id,submitted_by,complainant_name,received_at,subject,details,desired_outcome,advocate_details,acknowledged_at,assigned_to,investigation,actions_taken,outcome,appeal_information,status,resolved_at,portal_thread_id,updated_at").eq("organisation_id",p.organisation_id).order("received_at",{ascending:false}).limit(200);
 if(error)throw error;return data||[];
}
async function participantName(id){if(!id)return"Participant";const {data}=await db.from("participants").select("full_name,preferred_name").eq("id",id).maybeSingle();return data?.preferred_name||data?.full_name||"Participant"}
async function senderNames(ids){if(!ids.length)return new Map();const {data}=await db.from("profiles").select("id,full_name").in("id",ids);return new Map((data||[]).map(x=>[x.id,x.full_name]))}
function block(label,value){return value?`<section class="complaint-block"><strong>${esc(label)}</strong><p>${esc(value)}</p></section>`:""}

async function openRegister(){
 close("flo-complaint-register");
 const items=await complaints();
 const overlay=document.createElement("div");overlay.id="flo-complaint-register";overlay.className="modal-layer florence-complaint-overlay";
 overlay.innerHTML=`<button class="modal-scrim" type="button" aria-label="Close"></button><section class="modal florence-complaint-register" role="dialog" aria-modal="true"><button class="modal-close" type="button" aria-label="Close">×</button><p class="eyebrow">PRIVATE COMPLAINT WORKFLOW</p><h2>${isSupervisor()?"Complaint register":"Your complaints"}</h2><p>${isSupervisor()?"Open a complaint to read the full record, review its private conversation and reply securely.":"Open a complaint to read the full record and continue the private conversation."}</p><div class="complaint-register-list">${items.map(x=>`<button type="button" class="complaint-register-item" data-complaint-id="${x.id}"><span><small>${esc(fmt(x.received_at))}</small><strong>${esc(x.subject||"Complaint or feedback")}</strong>${isSupervisor()?`<em>${esc(x.complainant_name||"Florence user")}</em>`:""}</span><b>${esc(x.status||"Open")}</b></button>`).join("")||`<div class="empty-state"><strong>No complaints recorded</strong></div>`}</div></section>`;
 document.body.appendChild(overlay);overlay.querySelector(".modal-scrim").onclick=()=>overlay.remove();overlay.querySelector(".modal-close").onclick=()=>overlay.remove();
 overlay.querySelectorAll("[data-complaint-id]").forEach(b=>b.onclick=()=>void openComplaint(b.dataset.complaintId));
}

async function openComplaint(id){
 close("flo-complaint-detail");
 const {data:c,error}=await db.from("complaints").select("id,participant_id,submitted_by,complainant_name,received_at,subject,details,desired_outcome,advocate_details,acknowledged_at,assigned_to,investigation,actions_taken,outcome,appeal_information,status,resolved_at,portal_thread_id").eq("id",id).maybeSingle();if(error||!c)return toast(error?.message||"Complaint not found");
 let msgs=[];if(c.portal_thread_id){const q=await db.from("portal_messages").select("id,sender_id,message,created_at").eq("thread_id",c.portal_thread_id).order("created_at");if(!q.error)msgs=q.data||[]}
 const names=await senderNames([...new Set(msgs.map(x=>x.sender_id).filter(Boolean))]);const person=await participantName(c.participant_id);
 let assigned="Not assigned";if(c.assigned_to){const {data}=await db.from("profiles").select("full_name").eq("id",c.assigned_to).maybeSingle();assigned=data?.full_name||assigned}
 const overlay=document.createElement("div");overlay.id="flo-complaint-detail";overlay.className="modal-layer florence-complaint-overlay";
 overlay.innerHTML=`<button class="modal-scrim" type="button" aria-label="Close"></button><section class="modal florence-complaint-detail" role="dialog" aria-modal="true"><button class="modal-close" type="button" aria-label="Close">×</button><div class="complaint-detail-head"><div><p class="eyebrow">PRIVATE COMPLAINT RECORD</p><h2>${esc(c.subject||"Complaint or feedback")}</h2><p>${esc(person)} · ${esc(fmt(c.received_at))}</p></div><span class="status due">${esc(c.status||"Open")}</span></div><div class="complaint-meta"><div><small>Complainant</small><strong>${esc(c.complainant_name||"Florence user")}</strong></div><div><small>Acknowledged</small><strong>${esc(fmt(c.acknowledged_at))}</strong></div>${isSupervisor()?`<div><small>Assigned supervisor</small><strong>${esc(assigned)}</strong></div>`:""}</div><div class="complaint-detail-scroll">${block("What happened",c.details)}${block("Requested outcome",c.desired_outcome)}${block("Advocate or representative",c.advocate_details)}${isSupervisor()?block("Investigation record",c.investigation):""}${isSupervisor()?block("Actions taken",c.actions_taken):""}${block("Outcome",c.outcome)}${block("Review or appeal information",c.appeal_information)}<section class="complaint-conversation"><strong>Private conversation</strong><div>${msgs.map(m=>`<article class="message ${m.sender_id===profile?.id?"mine":""}"><strong>${esc(names.get(m.sender_id)||"Florence user")}</strong><p>${esc(m.message)}</p><small>${esc(fmt(m.created_at))}</small></article>`).join("")||`<div class="empty-state"><strong>No replies yet</strong></div>`}</div></section></div>${c.portal_thread_id?`<form class="complaint-reply">${isSupervisor()?`<label>Status<select name="status"><option${/received|acknowledged/i.test(c.status||"")?" selected":""}>Acknowledged</option><option${/in review|further review/i.test(c.status||"")?" selected":""}>In review</option><option${/resolved/i.test(c.status||"")?" selected":""}>Resolved</option></select></label>`:""}<label>${isSupervisor()?"Supervisor reply":"Reply or add information"}<textarea name="message" required maxlength="10000"></textarea></label><div class="modal-actions"><button type="button" data-close-detail>Close</button><button class="primary" type="submit">${isSupervisor()?"Send reply & update":"Send reply"}</button></div></form>`:`<div class="legacy-complaint-note"><strong>Read-only register record</strong><p>This older/internal record has no linked portal conversation. New portal complaints will create one automatically.</p><div class="modal-actions"><button type="button" data-close-detail>Close</button></div></div>`}</section>`;
 document.body.appendChild(overlay);overlay.querySelector(".modal-scrim").onclick=()=>overlay.remove();overlay.querySelector(".modal-close").onclick=()=>overlay.remove();overlay.querySelector("[data-close-detail]").onclick=()=>overlay.remove();
 const form=overlay.querySelector(".complaint-reply");if(form)form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),message=String(fd.get("message")||"").trim(),status=isSupervisor()?String(fd.get("status")||"Acknowledged"):null,submit=form.querySelector('button[type="submit"]');if(!message)return;submit.disabled=true;submit.textContent="Sending…";const {error}=await db.rpc("reply_to_portal_complaint",{p_complaint_id:c.id,p_message:message,p_status:status});if(error){toast(error.message);submit.disabled=false;submit.textContent=isSupervisor()?"Send reply & update":"Send reply";return}overlay.remove();toast("Complaint reply saved securely");await openComplaint(c.id)};
}

function openComplaintForm(){
 close("flo-new-complaint");const overlay=document.createElement("div");overlay.id="flo-new-complaint";overlay.className="modal-layer florence-complaint-overlay";
 overlay.innerHTML=`<button class="modal-scrim" type="button" aria-label="Close"></button><section class="modal record-modal florence-new-complaint" role="dialog" aria-modal="true"><button class="modal-close" type="button" aria-label="Close">×</button><span class="modal-icon">!</span><p class="eyebrow">PRIVATE COMPLAINT OR FEEDBACK</p><h2>Make a complaint</h2><p>This creates a private complaint record and secure conversation with the supervisors.</p><form class="record-form"><label>What is your complaint about?<input name="subject" required minlength="3" maxlength="180"></label><label>Tell us what happened<textarea name="details" required minlength="10" maxlength="10000"></textarea></label><label>What would you like to happen? (optional)<textarea name="desired_outcome"></textarea></label><label>Advocate or representative details (optional)<textarea name="advocate_details"></textarea></label><div class="modal-actions"><button type="button" data-cancel>Cancel</button><button class="primary" type="submit">Send securely</button></div></form></section>`;
 document.body.appendChild(overlay);overlay.querySelector(".modal-scrim").onclick=()=>overlay.remove();overlay.querySelector(".modal-close").onclick=()=>overlay.remove();overlay.querySelector("[data-cancel]").onclick=()=>overlay.remove();
 const form=overlay.querySelector("form");form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form),submit=form.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Sending securely…";const {data,error}=await db.rpc("submit_portal_complaint",{p_subject:String(fd.get("subject")||"").trim(),p_details:String(fd.get("details")||"").trim(),p_desired_outcome:String(fd.get("desired_outcome")||"").trim()||null,p_advocate_details:String(fd.get("advocate_details")||"").trim()||null});if(error){toast(error.message);submit.disabled=false;submit.textContent="Send securely";return}const result=Array.isArray(data)?data[0]:data;overlay.remove();toast("Complaint sent securely to the supervisors");if(result?.complaint_id)await openComplaint(result.complaint_id)};
}

function enhanceIncidentReview(){
 const heading=[...document.querySelectorAll("h1")].find(h=>h.textContent.trim()==="Review queue");if(!heading)return;const root=heading.closest("main")||document;
 const label=[...root.querySelectorAll("label")].find(l=>/record type/i.test(l.textContent||"")),select=label?.querySelector("select");if(select&&!select.querySelector('option[value="incident"]')){const o=document.createElement("option");o.value="incident";o.textContent="Incidents";select.appendChild(o)}
 root.querySelectorAll(".review-card").forEach(card=>{const title=card.querySelector("h2")?.textContent||"";if(/^Incident\s*·/i.test(title)){const e=card.querySelector(".eyebrow");if(e&&!e.textContent.trim())e.textContent="INCIDENT"}})
}
function enhanceComplaintButtons(){
 const activeComplaintTab=[...document.querySelectorAll("button.active")].find(b=>b.textContent.trim()==="Complaints & feedback");
 if(!activeComplaintTab){document.querySelectorAll("[data-open-complaint-register]").forEach(b=>b.remove());return}
 const h1=[...document.querySelectorAll("h1")].find(h=>["Incidents & complaints","Family & participant portal"].includes(h.textContent.trim()));if(!h1)return;
 const parent=h1.closest(".content")||h1.closest("main")||document;if(parent.querySelector("[data-open-complaint-register]"))return;
 const btn=document.createElement("button");btn.type="button";btn.className="row-primary florence-open-complaints";btn.dataset.openComplaintRegister="true";btn.textContent="Open complaint register";
 const tabs=activeComplaintTab.closest(".tabs");tabs?.insertAdjacentElement("afterend",btn);
}
function enhance(){enhanceIncidentReview();enhanceComplaintButtons()}
function schedule(){clearTimeout(enhanceTimer);enhanceTimer=setTimeout(enhance,80)}

document.addEventListener("click",e=>{const open=e.target.closest("[data-open-complaint-register]");if(open){e.preventDefault();e.stopPropagation();void openRegister();return}const b=e.target.closest("button");if(!b)return;const text=b.textContent.replace(/\s+/g," ").trim();if(isPortalUser()&&(text==="Record complaint or feedback"||text==="New complaint")){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openComplaintForm();return}if(text==="Complaints & feedback"||text==="Supervisor review")schedule()},true);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["class"]});window.addEventListener("pageshow",schedule);
getProfile().then(schedule).catch(()=>{});
