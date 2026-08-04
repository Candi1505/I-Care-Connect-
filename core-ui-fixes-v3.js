(()=>{
"use strict";
const loadLegacy=()=>{if(document.querySelector('script[data-florence-core-v2]'))return;const s=document.createElement('script');s.src='./core-ui-fixes-v2.js?v=20260804-1';s.dataset.florenceCoreV2='true';document.head.appendChild(s)};
loadLegacy();

const q=(s,r=document)=>r.querySelector(s);
const B=()=>window.FlorenceBridge;
const TIMEOUT_MS=30*60*1000;
const ACTIVITY_KEY='florence:last-activity';
let ending=false;
function toast(message){const b=B();if(b?.toast)return b.toast(message);const el=q('#toast');if(!el)return;el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),3000)}
function hideSecureApp(){const app=q('#app');if(app)app.style.visibility='hidden'}
function showSecureApp(){const app=q('#app');if(app)app.style.visibility=''}
function readLast(){const value=Number(localStorage.getItem(ACTIVITY_KEY)||0);return Number.isFinite(value)?value:0}
function writeLast(){if(B()?.profile)localStorage.setItem(ACTIVITY_KEY,String(Date.now()))}
async function forceLogout(reason='Your Florence session expired after 30 minutes of inactivity.'){
 if(ending)return;ending=true;hideSecureApp();
 try{const b=B();if(b?.db)await b.db.auth.signOut({scope:'local'}).catch(()=>b.db.auth.signOut().catch(()=>{}));}finally{
  localStorage.removeItem(ACTIVITY_KEY);
  sessionStorage.clear();
  try{if('caches' in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('florence-')).map(k=>caches.delete(k)))}}catch(_e){}
  location.replace(`${location.pathname}?session_expired=${Date.now()}`);
 }
}
async function verifySessionAge(){
 const b=B();if(!b?.db||!b?.profile)return false;
 const last=readLast();
 if(last&&Date.now()-last>=TIMEOUT_MS){await forceLogout();return false}
 if(!last)writeLast();showSecureApp();return true;
}
['pointerdown','touchstart','keydown','mousedown'].forEach(type=>document.addEventListener(type,writeLast,{passive:true,capture:true}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void verifySessionAge()});
setInterval(()=>{if(B()?.profile&&Date.now()-readLast()>=TIMEOUT_MS)void forceLogout()},15000);
hideSecureApp();
const securityTimer=setInterval(()=>{if(B()?.db&&B()?.profile){clearInterval(securityTimer);void verifySessionAge()}},100);
setTimeout(()=>{clearInterval(securityTimer);if(!B()?.profile)showSecureApp()},15000);

const fields=['full_name','preferred_name','date_of_birth','ndis_number','address','phone','emergency_contact','guardian_nominee','gp','pharmacy','communication_needs','diagnoses','allergies','goals','preferences','risks_and_safeguards'];
function participantId(){return q('#pf-select')?.value||q('#participant-file-select')?.value||''}
function supervisor(){return ['supervisor','admin','owner'].includes(String(B()?.profile?.role||'').toLowerCase())}
async function editParticipant(){
 const b=B();if(!b?.db||!b?.profile)throw new Error('Florence is still loading your secure account.');
 if(!supervisor())throw new Error('Only supervisors can edit participant details.');
 const id=participantId();if(!id)throw new Error('Choose a participant first.');
 const {data:p,error}=await b.db.from('participants').select('*').eq('id',id).single();if(error||!p)throw error||new Error('Participant record not found.');
 const f=b.field;const formFields=[f('full_name','Full legal name','text',[],true),f('preferred_name','Preferred name','text',[],false),f('date_of_birth','Date of birth','date',[],false),f('ndis_number','NDIS number','text',[],false),f('address','Residential address','textarea',[],false),f('phone','Participant phone','text',[],false),f('emergency_contact','Emergency contact details','textarea',[],false),f('guardian_nominee','Guardian or nominee','textarea',[],false),f('gp','GP / doctor details','textarea',[],false),f('pharmacy','Pharmacy details','textarea',[],false),f('communication_needs','Communication needs','textarea',[],false),f('diagnoses','Diagnoses','textarea',[],false),f('allergies','Allergies','textarea',[],false),f('goals','Goals','textarea',[],false),f('preferences','Preferences and routines','textarea',[],false),f('risks_and_safeguards','Risks and safeguards','textarea',[],false)];
 const initial=Object.fromEntries(fields.map(key=>[key,p[key]??'']));
 b.form(`Edit ${p.preferred_name||p.full_name}`,formFields,async values=>{const payload={};for(const key of fields){const value=String(values[key]??'').trim();payload[key]=value||null}if(!payload.full_name)throw new Error('Full legal name is required.');payload.updated_at=new Date().toISOString();const {error:updateError}=await b.db.from('participants').update(payload).eq('id',id);if(updateError)throw updateError;await b.auditAccess?.('UPDATE','participants',id,{fields});setTimeout(()=>window.FlorenceRefresh?.()||location.reload(),400);return 'Participant details updated'},initial);
}
async function approvePlan(){
 const b=B();if(!b?.db||!b?.profile)throw new Error('Florence is still loading your secure account.');if(!supervisor())throw new Error('Only supervisors can approve care plans.');
 const id=participantId();if(!id)throw new Error('Choose a participant first.');if(!confirm('Approve the current care plan as the authorised version?'))return;
 const now=new Date().toISOString();const {error}=await b.db.from('participants').update({care_plan_approved_at:now,care_plan_approved_by:b.profile.id,updated_at:now}).eq('id',id);if(error)throw error;await b.auditAccess?.('UPDATE','participants',id,{action:'CARE_PLAN_APPROVED'});toast('Care plan approved');setTimeout(()=>window.FlorenceRefresh?.()||location.reload(),400);
}
function button(id,label,kind,fn){const el=document.createElement('button');el.id=id;el.type='button';el.className=kind;el.textContent=label;el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void fn().catch(err=>toast(err?.message||'Florence could not complete that action.'))});return el}
function ensureParticipantControls(){
 const host=q('#pf-content')||q('#participant-file-content');if(!host)return;
 const hero=q('.pf-hero',host)||q('.participant-file-hero',host);
 if(hero&&!q('#edit-participant-native',hero)){let area=q('.florence-native-actions',hero);if(!area){area=document.createElement('div');area.className='florence-native-actions';hero.appendChild(area)}area.appendChild(button('edit-participant-native','Edit participant','secondary',editParticipant))}
 const active=q('[data-pf-tab="care"].active')||q('[data-pf-tab="care-plan"].active')||q('[data-participant-file-tab="care-plan"].active');
 if(active){const body=q('.pf-body',host)||q('.participant-file-tab-content',host)||host;const pending=/Approval pending/i.test(body.textContent||'');if(pending&&!q('#approve-care-plan-native',body)){const bar=q('.pf-actions',body)||body;bar.appendChild(button('approve-care-plan-native','Approve care plan','primary',approvePlan))}}
}
const observer=new MutationObserver(ensureParticipantControls);
function startControls(){const host=q('#pf-content')||q('#participant-file-content');if(host&&!host.__nativeControls){observer.observe(host,{childList:true,subtree:true});host.__nativeControls=true}ensureParticipantControls()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startControls,{once:true});else startControls();
window.addEventListener('florence:ready',()=>{if(!readLast())writeLast();void verifySessionAge();startControls()});
window.addEventListener('pageshow',()=>{void verifySessionAge();startControls()});
document.addEventListener('click',()=>setTimeout(ensureParticipantControls,60));
setInterval(startControls,500);
const style=document.createElement('style');style.textContent='.florence-native-actions{display:flex;flex-direction:column;align-items:flex-end;gap:8px}.florence-native-actions button{background:#fff!important;color:#315d46!important;border-color:#fff!important;white-space:nowrap}';document.head.appendChild(style);
})();
