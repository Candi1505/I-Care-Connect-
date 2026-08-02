(()=>{
"use strict";
const C=window.FLORENCE_CONFIG||{};
const q=selector=>document.querySelector(selector);
function signInUrl(){return new URL("./",location.href).toString()}
function setStatus(message,isError=false){
 const status=q("#password-setup-status");status.textContent=message;status.classList.toggle("error",isError);status.setAttribute("role",isError?"alert":"status");
}
async function submitSetup(email,code,password){
 if(!C.supabaseUrl||!C.supabaseAnonKey)throw new Error("Florence is missing its secure connection settings");
 const response=await fetch(`${C.supabaseUrl}/functions/v1/account-setup`,{
  method:"POST",
  headers:{"Content-Type":"application/json","apikey":C.supabaseAnonKey},
  body:JSON.stringify({email,code,password}),
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
 const button=q("#save-password");
 try{
  if(!/^\S+@\S+\.\S+$/.test(email))throw new Error("Enter the email address used for your Florence account");
  if(!/^\d{8}$/.test(code))throw new Error("Enter all eight numbers from the setup code");
  if(password.length<10)throw new Error("Use a password with at least ten characters");
  if(password!==confirmation)throw new Error("The two passwords do not match");
  button.disabled=true;button.textContent="Creating password…";setStatus("Checking the one-time code and saving your password securely…");
  await submitSetup(email,code,password);
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
 q("#setup-email").focus();
},{once:true});
})();
