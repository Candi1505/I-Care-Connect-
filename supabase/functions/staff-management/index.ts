import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const env=(name:string)=>{
 const value=Deno.env.get(name);
 if(!value)throw new Error(`Missing Edge Function secret: ${name}`);
 return value;
};
const admin=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{
 auth:{persistSession:false,autoRefreshToken:false}
});

function configuredOrigins(){
 const raw=Deno.env.get("FLORENCE_ALLOWED_ORIGINS")||env("FLORENCE_APP_URL");
 const origins=new Set<string>();
 for(const item of raw.split(",").map(value=>value.trim()).filter(Boolean)){
  try{origins.add(new URL(item).origin)}catch{throw new Error(`Invalid Florence origin: ${item}`)}
 }
 return origins;
}
function originAllowed(req:Request){
 const origin=req.headers.get("Origin");
 return !origin||configuredOrigins().has(origin);
}
function corsHeaders(req:Request){
 const origin=req.headers.get("Origin");
 const allowed=configuredOrigins();
 return {
  "Access-Control-Allow-Origin":origin&&allowed.has(origin)?origin:[...allowed][0],
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Max-Age":"86400",
  "Vary":"Origin"
 };
}
const json=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,
 headers:{...corsHeaders(req),"Content-Type":"application/json","Cache-Control":"no-store"}
});

function jwtClaims(token:string):Record<string,unknown>{
 const part=token.split(".")[1];
 if(!part)throw new Error("Invalid Florence access token");
 const base64=part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=");
 const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
 return JSON.parse(new TextDecoder().decode(bytes));
}

async function supervisorContext(req:Request){
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)throw new Error("Sign in to Florence first");
 const db=admin();
 const {data:{user},error:userError}=await db.auth.getUser(token);
 if(userError||!user)throw new Error("Your Florence session has expired");
 const claims=jwtClaims(token);
 if(claims.sub!==user.id||claims.aal!=="aal2")throw new Error("Multi-factor authentication is required");
 const {data:profile,error}=await db.from("profiles")
  .select("id,organisation_id,role,active")
  .eq("id",user.id).single();
 if(error||!profile?.active||profile.role!=="supervisor"){
  throw new Error("Only active supervisors can manage Florence accounts");
 }
 return {db,user,profile};
}

async function authUsers(db:ReturnType<typeof admin>){
 const users=[];let page=1;
 while(page<=10){
  const {data,error}=await db.auth.admin.listUsers({page,perPage:100});
  if(error)throw error;
  users.push(...data.users);
  if(data.users.length<100)break;
  page++;
 }
 return users;
}

async function audit(
 db:ReturnType<typeof admin>,organisationId:string,actorId:string,
 action:"INSERT"|"UPDATE",recordId:string,event:string,details:Record<string,unknown>={}
){
 const {error}=await db.from("audit_events").insert({
  organisation_id:organisationId,actor_id:actorId,table_name:"profiles",
  record_id:recordId,action,after_data:{event,...details}
 });
 if(error)throw error;
}

Deno.serve(async req=>{
 if(!originAllowed(req))return json(req,{error:"Request origin is not permitted"},403);
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
 try{
  if(req.method!=="POST")return json(req,{error:"POST required"},405);
  const {db,user,profile}=await supervisorContext(req);
  const body=await req.json().catch(()=>({}));
  const action=String(body.action||"list");

  if(action==="list"){
   const [{data:profiles,error},users]=await Promise.all([
    db.from("profiles")
     .select("id,full_name,email,role,active,participant_id,created_at")
     .eq("organisation_id",profile.organisation_id).order("full_name"),
    authUsers(db)
   ]);
   if(error)throw error;
   const byId=new Map(users.map(account=>[account.id,account]));
   return json(req,{staff:(profiles||[]).map(account=>{
    const authAccount=byId.get(account.id);
    return {
     ...account,
     email:account.email||authAccount?.email||null,
     last_sign_in_at:authAccount?.last_sign_in_at||null,
     email_confirmed_at:authAccount?.email_confirmed_at||null,
     banned_until:authAccount?.banned_until||null
    };
   })});
  }

  if(action==="invite"){
   const email=String(body.email||"").trim().toLowerCase();
   const fullName=String(body.full_name||"").trim();
   const allowedRoles=["staff","supervisor","family","client"];
   const role=allowedRoles.includes(body.role)?String(body.role):"staff";
   const participantId=["family","client"].includes(role)?String(body.participant_id||""):null;
   if(!fullName||!/^\S+@\S+\.\S+$/.test(email))throw new Error("A valid name and email are required");
   if(["family","client"].includes(role)&&!participantId){
    throw new Error("A family or participant portal account must be linked to a participant");
   }
   if(participantId){
    const {data:participant,error:participantError}=await db.from("participants")
     .select("id").eq("id",participantId)
     .eq("organisation_id",profile.organisation_id).single();
    if(participantError||!participant)throw new Error("The selected participant was not found in this organisation");
   }

   const users=await authUsers(db);
   let invitedUser=users.find(account=>String(account.email||"").toLowerCase()===email)||null;
   const existing=!!invitedUser;
   if(invitedUser){
    const {data:existingProfile,error:profileLookupError}=await db.from("profiles")
     .select("id,organisation_id").eq("id",invitedUser.id).maybeSingle();
    if(profileLookupError)throw profileLookupError;
    if(existingProfile&&existingProfile.organisation_id!==profile.organisation_id){
     throw new Error("This email is already linked to another Florence organisation");
    }
   }

   if(!invitedUser){
    const redirectTo=env("FLORENCE_APP_URL");
    // The temporary staff metadata avoids the family/client participant constraint in any
    // auth-user creation trigger; the authoritative profile is upserted immediately below.
    const creationRole=["family","client"].includes(role)?"staff":role;
    const {data,error}=await db.auth.admin.inviteUserByEmail(email,{
     redirectTo,
     data:{
      full_name:fullName,organisation_id:profile.organisation_id,
      role:creationRole,requested_role:role,participant_id:participantId
     }
    });
    if(error||!data.user)throw new Error(error?.message||"Invitation could not be created");
    invitedUser=data.user;
   }else{
    const {error:authError}=await db.auth.admin.updateUserById(invitedUser.id,{
     user_metadata:{
      ...invitedUser.user_metadata,full_name:fullName,
      organisation_id:profile.organisation_id,role,participant_id:participantId
     }
    });
    if(authError)throw new Error(authError.message||"The existing account could not be updated");
   }

   const {error:profileError}=await db.from("profiles").upsert({
    id:invitedUser.id,organisation_id:profile.organisation_id,
    participant_id:participantId,full_name:fullName,email,role,active:true
   },{onConflict:"id"});
   if(profileError){
    if(!existing)await db.auth.admin.deleteUser(invitedUser.id);
    throw profileError;
   }
   await audit(db,profile.organisation_id,user.id,existing?"UPDATE":"INSERT",invitedUser.id,
    existing?"account_linked":"account_invited",{role});
   return json(req,{success:true,user_id:invitedUser.id,existing,requires_password_reset:existing,email});
  }

  if(action==="set-active"){
   const userId=String(body.user_id||"");
   const active=body.active===true;
   if(!userId)throw new Error("Worker account is required");
   if(userId===user.id&&!active)throw new Error("You cannot deactivate your own account");
   const {data:target,error:targetError}=await db.from("profiles")
    .select("id,role,active").eq("id",userId)
    .eq("organisation_id",profile.organisation_id).single();
   if(targetError||!target)throw new Error("Florence account not found");
   if(!active&&target.role==="supervisor"){
    const {count}=await db.from("profiles").select("id",{count:"exact",head:true})
     .eq("organisation_id",profile.organisation_id).eq("role","supervisor").eq("active",true);
    if((count||0)<=1)throw new Error("Florence must keep at least one active supervisor");
   }
   const {error:authError}=await db.auth.admin.updateUserById(userId,{
    ban_duration:active?"none":"876000h"
   });
   if(authError)throw authError;
   const {error}=await db.from("profiles").update({active})
    .eq("id",userId).eq("organisation_id",profile.organisation_id);
   if(error)throw error;
   await audit(db,profile.organisation_id,user.id,"UPDATE",userId,
    active?"account_reactivated":"account_deactivated",{role:target.role});
   return json(req,{success:true});
  }

  if(action==="set-role"){
   const userId=String(body.user_id||"");
   const role=body.role==="supervisor"?"supervisor":"staff";
   const {data:target,error:targetError}=await db.from("profiles")
    .select("id,role,active").eq("id",userId)
    .eq("organisation_id",profile.organisation_id).single();
   if(targetError||!target)throw new Error("Worker account not found");
   if(!["staff","supervisor"].includes(target.role)){
    throw new Error("Portal accounts cannot be converted through the worker role control");
   }
   if(target.role==="supervisor"&&role!=="supervisor"&&target.active){
    const {count}=await db.from("profiles").select("id",{count:"exact",head:true})
     .eq("organisation_id",profile.organisation_id).eq("role","supervisor").eq("active",true);
    if((count||0)<=1)throw new Error("Florence must keep at least one active supervisor");
   }
   const {data:{user:authUser},error:getAuthError}=await db.auth.admin.getUserById(userId);
   if(getAuthError||!authUser)throw new Error("The worker authentication account was not found");
   const {error:authError}=await db.auth.admin.updateUserById(userId,{
    user_metadata:{...authUser.user_metadata,role}
   });
   if(authError)throw authError;
   const {error}=await db.from("profiles").update({role})
    .eq("id",userId).eq("organisation_id",profile.organisation_id);
   if(error)throw error;
   await audit(db,profile.organisation_id,user.id,"UPDATE",userId,"role_changed",{from:target.role,to:role});
   return json(req,{success:true});
  }

  return json(req,{error:"Unknown staff-management action"},400);
 }catch(error){
  const record=error&&typeof error==="object"?error as Record<string,unknown>:null;
  const message=error instanceof Error
   ?error.message
   :String(record?.message||record?.error_description||record?.details||record?.hint||record?.code||error||"Staff management failed");
  console.error("staff-management error:",message);
  return json(req,{error:message},400);
 }
});
