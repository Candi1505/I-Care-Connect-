import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";

const APP_ORIGIN="https://i-care-connect.candi1505.workers.dev";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":APP_ORIGIN,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"}});
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error(`Missing ${name}`);return value};
const admin=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
const normaliseEmail=(value:unknown)=>String(value||"").trim().toLowerCase();
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,"0")).join("");
const setupCode=()=>String(crypto.getRandomValues(new Uint32Array(1))[0]%100000000).padStart(8,"0");

async function context(req:Request){
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)throw new Error("Sign in to Florence first");
 const db=admin();
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user)throw new Error("Your Florence session has expired");
 const claims=JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(token.split(".")[1].length/4)*4,"=")));
 if(claims.sub!==user.id||claims.aal!=="aal2")throw new Error("Multi-factor authentication is required");
 const {data:profile,error:profileError}=await db.from("profiles").select("id,organisation_id,role,active").eq("id",user.id).single();
 if(profileError||!profile?.active||profile.role!=="supervisor")throw new Error("Only active supervisors can manage account setup");
 return {db,user,profile};
}

async function allUsers(db:ReturnType<typeof admin>){
 const users=[];for(let page=1;page<=10;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:100});if(error)throw error;users.push(...data.users);if(data.users.length<100)break}return users;
}

async function issueCode(db:ReturnType<typeof admin>,organisationId:string,userId:string,email:string,createdBy:string){
 await db.from("account_setup_codes").update({used_at:new Date().toISOString()}).eq("user_id",userId).is("used_at",null);
 const code=setupCode();
 const {error}=await db.from("account_setup_codes").insert({organisation_id:organisationId,user_id:userId,email,code_hash:await sha256(code),expires_at:new Date(Date.now()+30*60*1000).toISOString(),created_by:createdBy});
 if(error)throw error;
 return code;
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:{"Access-Control-Allow-Origin":APP_ORIGIN,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"}});
 if(req.headers.get("Origin")&&req.headers.get("Origin")!==APP_ORIGIN)return json({error:"Origin not permitted"},403);
 try{
  if(req.method!=="POST")return json({error:"POST required"},405);
  const {db,user,profile}=await context(req);const body=await req.json().catch(()=>({}));const action=String(body.action||"");
  if(action==="invite"){
   const email=normaliseEmail(body.email),fullName=String(body.full_name||"").trim(),allowed=["staff","supervisor","family","client"],role=allowed.includes(body.role)?String(body.role):"staff",portalRole=["family","client"].includes(role),participantId=portalRole?String(body.participant_id||""):null,relationship=portalRole?String(body.relationship||"").trim():null;
   if(!fullName||!/^\S+@\S+\.\S+$/.test(email))throw new Error("A valid name and email are required");
   if(portalRole){
    if(body.authorisation_confirmed!==true)throw new Error("Confirm this person is authorised for the participant");
    if(role==="family"&&!relationship)throw new Error("Record the family representative's relationship to the participant");
    const {data,error}=await db.from("participants").select("id").eq("id",participantId).eq("organisation_id",profile.organisation_id).single();if(error||!data)throw new Error("Choose a valid participant for this portal account");
   }
   const users=await allUsers(db);let authUser=users.find(item=>normaliseEmail(item.email)===email)||null;const existing=!!authUser;
   let existingProfile:null|{organisation_id:string;role:string;active:boolean;portal_access_acknowledged_at:string|null}=null;
   if(authUser){
    const {data}=await db.from("profiles").select("organisation_id,role,active,portal_access_acknowledged_at").eq("id",authUser.id).maybeSingle();existingProfile=data;
    if(existingProfile&&existingProfile.organisation_id!==profile.organisation_id)throw new Error("This email is already linked to another Florence organisation");
    const {data,error}=await db.auth.admin.updateUserById(authUser.id,{email_confirm:true,user_metadata:{...authUser.user_metadata,full_name:fullName,organisation_id:profile.organisation_id,role,participant_id:participantId}});if(error||!data.user)throw error||new Error("Account could not be updated");authUser=data.user;
   }else{
    const {data,error}=await db.auth.admin.createUser({email,email_confirm:true,user_metadata:{full_name:fullName,organisation_id:profile.organisation_id,role,participant_id:participantId}});if(error||!data.user)throw error||new Error("Account could not be created");authUser=data.user;
   }
   const needsPortalActivation=portalRole&&(!existingProfile?.portal_access_acknowledged_at||!["family","client"].includes(existingProfile.role));
   const active=needsPortalActivation?false:(existingProfile?.active??true);
   const {error:profileError}=await db.from("profiles").upsert({id:authUser.id,organisation_id:profile.organisation_id,participant_id:participantId,full_name:fullName,email,role,active,portal_relationship:relationship},{onConflict:"id"});if(profileError){if(!existing)await db.auth.admin.deleteUser(authUser.id);throw profileError}
   const code=await issueCode(db,profile.organisation_id,authUser.id,email,user.id);
   await db.from("audit_events").insert({organisation_id:profile.organisation_id,actor_id:user.id,table_name:"profiles",record_id:authUser.id,action:existing?"UPDATE":"INSERT",after_data:{event:existing?"setup_code_reissued":"account_created_with_setup_code",role,participant_id:participantId,relationship,portal_activation_required:needsPortalActivation,authorisation_confirmed:true}});
   return json({success:true,user_id:authUser.id,existing,setup_code:code,expires_minutes:30,email,role,participant_id:participantId,activation_required:needsPortalActivation});
  }
  if(action==="generate-code"){
   const userId=String(body.user_id||"");const {data:target,error}=await db.from("profiles").select("id,email,role,active").eq("id",userId).eq("organisation_id",profile.organisation_id).single();if(error||!target?.active||!target.email)throw new Error("Active Florence account with an email address not found");
   const code=await issueCode(db,profile.organisation_id,target.id,normaliseEmail(target.email),user.id);
   await db.from("audit_events").insert({organisation_id:profile.organisation_id,actor_id:user.id,table_name:"profiles",record_id:target.id,action:"UPDATE",after_data:{event:"setup_code_reissued"}});
   return json({success:true,setup_code:code,expires_minutes:30,email:target.email,role:target.role});
  }
  return json({error:"Unknown account setup action"},400);
 }catch(error){return json({error:error instanceof Error?error.message:String(error)},400)}
});
