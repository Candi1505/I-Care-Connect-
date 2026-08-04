(()=>{
"use strict";
function toast(message){const el=document.querySelector("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3500)}
async function handleLogin(event){
 const form=event.target;
 if(!(form instanceof HTMLFormElement)||form.id!=="login-form")return;
 event.preventDefault();event.stopImmediatePropagation();
 const button=form.querySelector('button[type="submit"],button.primary'),email=document.querySelector("#email")?.value.trim(),password=document.querySelector("#password")?.value||"";
 if(!email||!password)return toast("Enter your email and password");
 const original=button?.textContent||"Sign in securely";
 if(button){button.disabled=true;button.textContent="Signing in…"}
 try{
  const C=window.FLORENCE_CONFIG||{};
  if(!C.supabaseUrl||!C.supabaseAnonKey||!window.supabase?.createClient)throw new Error("Florence security services are still loading. Refresh and try again.");
  const client=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage,storageKey:"florence-auth-session"}});
  const result=await Promise.race([
   client.auth.signInWithPassword({email,password}),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error("Florence could not complete sign-in. Check your connection and try again.")),15000))
  ]);
  if(result.error)throw result.error;
  if(!result.data?.session)throw new Error("Florence did not receive a secure session.");
  if(button)button.textContent="Opening authentication…";
  location.reload();
 }catch(error){toast(error?.message||"Florence could not sign in");if(button){button.disabled=false;button.textContent=original}}
}
document.addEventListener("submit",handleLogin,true);
})();