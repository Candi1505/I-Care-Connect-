(()=>{
"use strict";

const C=window.FLORENCE_CONFIG||{};
const q=selector=>document.querySelector(selector);
const initialHash=new URLSearchParams(location.hash.replace(/^#/,""));
const initialQuery=new URLSearchParams(location.search);
const initialLinkError=initialHash.get("error_description")||initialQuery.get("error_description")||"";
let db=null;
let verifiedSession=null;

function signInUrl(){return new URL("./",location.href).toString()}
function setStatus(message,isError=false){
 const status=q("#password-setup-status");
 status.textContent=message;
 status.classList.toggle("error",isError);
 status.setAttribute("role",isError?"alert":"status");
}
function showForm(){
 q("#password-setup-intro").textContent="Create a private password to finish activating your Florence account.";
 q("#password-setup-form").classList.remove("hidden");
 setStatus("Use at least ten characters. Do not share this password with anyone.");
 requestAnimationFrame(()=>q("#new-password").focus());
}
function showExpired(message){
 q("#password-setup-intro").textContent="This access link could not be used.";
 q("#password-setup-form").classList.add("hidden");
 setStatus(message||"The link may have expired or already been used. Ask a Florence supervisor to tap Resend access email and open the newest email only.",true);
}
function clearSensitiveUrl(){
 try{history.replaceState({},document.title,location.pathname)}catch(_error){}
}
async function waitForSession(timeoutMs=8000){
 const current=await db.auth.getSession();
 if(current.error)throw current.error;
 if(current.data.session)return current.data.session;
 return await new Promise(resolve=>{
  let finished=false;
  const finish=session=>{
   if(finished)return;
   finished=true;
   clearTimeout(timer);
   subscription?.unsubscribe();
   resolve(session||null);
  };
  const {data:{subscription}}=db.auth.onAuthStateChange((_event,session)=>{if(session)finish(session)});
  const timer=setTimeout(()=>finish(null),timeoutMs);
 });
}
async function boot(){
 q("#continue-to-florence").href=signInUrl();
 document.querySelectorAll('a[href="./"]').forEach(link=>link.href=signInUrl());
 if(!C.supabaseUrl||!C.supabaseAnonKey){
  showExpired("Florence is missing its Supabase connection settings. Contact I-Care Connect before trying again.");
  return;
 }
 if(initialLinkError){
  showExpired(decodeURIComponent(initialLinkError.replace(/\+/g," ")));
  clearSensitiveUrl();
  return;
 }
 try{
  db=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey);
  verifiedSession=await waitForSession();
  if(!verifiedSession){showExpired();return}
  clearSensitiveUrl();
  showForm();
 }catch(error){
  showExpired(error?.message||"Florence could not verify this access link.");
 }
}

q("#password-setup-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const password=q("#new-password").value;
 const confirmation=q("#confirm-password").value;
 const button=q("#save-password");
 try{
  if(!verifiedSession)throw new Error("The secure access session has expired. Ask a supervisor to resend the access email.");
  if(password.length<10)throw new Error("Use a password with at least ten characters.");
  if(password!==confirmation)throw new Error("The two passwords do not match.");
  button.disabled=true;
  button.textContent="Saving password…";
  setStatus("Saving your password securely…");
  const {error}=await db.auth.updateUser({password});
  if(error)throw error;
  await db.auth.signOut({scope:"local"}).catch(()=>{});
  verifiedSession=null;
  event.currentTarget.reset();
  event.currentTarget.classList.add("hidden");
  q("#password-setup-intro").textContent="Your Florence password has been saved.";
  setStatus("Password created successfully. Continue to Florence and sign in with your email address and the password you just made.");
  q("#continue-to-florence").classList.remove("hidden");
 }catch(error){
  setStatus(error?.message||"Florence could not save that password.",true);
  button.disabled=false;
  button.textContent="Save password securely";
 }
});

addEventListener("DOMContentLoaded",()=>void boot(),{once:true});
})();
