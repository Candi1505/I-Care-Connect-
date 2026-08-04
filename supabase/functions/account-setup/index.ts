import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
const APP_ORIGIN="https://i-care-connect.candi1505.workers.dev";
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error(`Missing ${name}`);return value};
const db=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":APP_ORIGIN,"Access-Control-Allow-Headers":"content-type, apikey, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}});
const normaliseEmail=(value:unknown)=>String(value||"").trim().toLowerCase();
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
const secureEqual=(left:string,right:string)=>{const a=new TextEncoder().encode(left),b=new TextEncoder().encode(right);let difference=a.length^b.length;const size=Math.max(a.length,b.length);for(let index=0;index<size;index++)difference|=(a[index]||0)^(b[index]||0);return difference===0};
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:{"Access-Control-Allow-Origin":APP_ORIGIN,"Access-Control-Allow-Headers":"content-type, apikey, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"}});
 if(req.headers.get("Origin")&&req.headers.get("Origin")!==APP_ORIGIN)return json({error:"Origin not permitted"},403);
 try{
  if(req.method!=="POST")return json({error:"POST required"},405);
  const body=await req.json().catch(()=>({}));
  const email=normaliseEmail(body.email),code=String(body.code||"").replace(/\D/g,""),password=String(body.password||"");
  if(!/^\S+@\S+\.\S+$/.test(email))throw new Error("Enter the email address used for your Florence account");
  if(!/^\d{8}$/.test(code))throw new Error("Enter the eight-digit setup code supplied by your supervisor");
  if(password.length<10)throw new Error("Use a password with at least ten characters");
  const admin=db();
  const {data:profile,error:profileError}=await admin.from("profiles").select("id,organisation_id,active").eq("email",email).maybeSingle();
  if(profileError||!profile?.active)throw new Error("The account or setup code is not valid");
  const {data:record,error:recordError}=await admin.from("account_setup_codes").select("id,code_hash,expires_at,failed_attempts,max_attempts,used_at").eq("user_id",profile.id).eq("email",email).is("used_at",null).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(recordError||!record)throw new Error("The account or setup code is not valid");
  if(new Date(record.expires_at).getTime()<=Date.now())throw new Error("This setup code has expired. Ask your supervisor for a new code");
  if(record.failed_attempts>=record.max_attempts)throw new Error("This setup code is locked. Ask your supervisor for a new code");
  if(!secureEqual(await sha256(code),String(record.code_hash||""))){
   await admin.from("account_setup_codes").update({failed_attempts:record.failed_attempts+1}).eq("id",record.id);
   throw new Error("The account or setup code is not valid");
  }
  const {error:authError}=await admin.auth.admin.updateUserById(profile.id,{password,email_confirm:true});if(authError)throw new Error("Florence could not save the password");
  const now=new Date().toISOString();
  await admin.from("account_setup_codes").update({used_at:now}).eq("id",record.id);
  await admin.from("audit_events").insert({organisation_id:profile.organisation_id,actor_id:profile.id,table_name:"profiles",record_id:profile.id,action:"UPDATE",after_data:{event:"password_created_with_setup_code"}});
  return json({success:true});
 }catch(error){return json({error:error instanceof Error?error.message:String(error)},400)}
});
