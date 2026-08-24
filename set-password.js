(()=>{
"use strict";
const C=window.FLORENCE_CONFIG||{};
const q=selector=>document.querySelector(selector);
function signInUrl(){return new URL("./",location.href).toString()}
function decodeSetupPayload(value){
 try{
  const base64=value.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(value.length/4)*4,"=");
  const binary=atob(base64),bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
 }catch{return null}
}
function consumeSetupLink(){
 const params=new URLSearchParams(location.hash.slice(1)),payload=decodeSetupPayload(params.get("setup")||"");
 if(!payload)return false;
 history.replaceState(null,"",`${location.pathname}${location.search}`);
 if(/^\S+@\S+\.\S+$/.test(String(payload.email||"")))q("#setup-email").value=String(payload.email).trim().toLowerCase();
 if(/^\d{8}$/.test(String(payload.code||"")))q("#setup-code").value=String(payload.code);
 q("#password-setup-intro").textContent="Your private Florence setup link has filled in the account details. Create a password and accept the confidentiality acknowledgement to continue.";
 setStatus("This one-time setup link expires after 30 minutes and can only be used once.");
 return true;
}
function setStatus(message,isError=false){
 const status=q("#password-setup-status");status.textContent=message;status.classList.toggle("error",isError);status.setAttribute("role",isError?"alert":"status");
}
async function submitSetup(email,code,password,accessAcknowledgementConfirmed){
 if(!C.supabaseUrl||!C.supabaseAnonKey)throw new Error("Florence is missing its secure connection settings");
 const response=await fetch(`${C.supabaseUrl}/functions/v1/account-setup`,{
  method:"POST",
  headers:{"Content-Type":"application/json","apikey":C.supabaseAnonKey},
  body:JSON.stringify({email,code,password,access_acknowledgement_confirmed:accessAcknowledgementConfirmed}),
  cache:"no-store",
  credentials:"omit",
  referrerPolicy:"no-referrer"
 });
 const payload=await response.json().catch(()=>({}));
 if(!response.ok||payload.error)throw new Error(payload.error||"Florence could not create the password");
 return payload;
}
q("#password-setup-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const form=event.currentTarget;
 const email=q("#setup-email").value.trim().toLowerCase();
 const code=q("#setup-code").value.replace(/\D/g,"");
 const password=q("#new-password").value;
 const confirmation=q("#confirm-password").value;
 const accessAcknowledgementConfirmed=q("#access-acknowledgement").checked;
 const button=q("#save-password");
 try{
  if(!/^\S+@\S+\.\S+$/.test(email))throw new Error("Enter the email address used for your Florence account");
  if(!/^\d{8}$/.test(code))throw new Error("Enter all eight numbers from the setup code");
  if(password.length<10)throw new Error("Use a password with at least ten characters");
  if(password!==confirmation)throw new Error("The two passwords do not match");
  if(!accessAcknowledgementConfirmed)throw new Error("Accept the confidentiality acknowledgement before continuing");
  button.disabled=true;button.textContent="Creating password…";setStatus("Checking the one-time code and saving your password securely…");
  await submitSetup(email,code,password,accessAcknowledgementConfirmed);
  form.reset();form.classList.add("hidden");
  q("#password-setup-intro").textContent="Your Florence password has been created.";
  setStatus("Account setup completed. Continue to Florence and sign in with your email address and the password you just made.");
  q("#continue-to-florence").classList.remove("hidden");
 }catch(error){
  setStatus(error?.message||"Florence could not complete account setup.",true);
  button.disabled=false;button.textContent="Create password securely";
 }
});
addEventListener("DOMContentLoaded",()=>{
 q("#continue-to-florence").href=signInUrl();
 document.querySelectorAll('a[href="./"]').forEach(link=>link.href=signInUrl());
 const fromLink=consumeSetupLink();
 q(fromLink?"#new-password":"#setup-email").focus();
},{once:true});
})();
