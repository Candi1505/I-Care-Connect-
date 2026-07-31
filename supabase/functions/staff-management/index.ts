import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DEFAULT_APP_URL="https://candi1505.github.io/I-Care-Connect-/";
const optionalEnv=(name:string)=>String(Deno.env.get(name)||"").trim();
const env=(name:string)=>{const value=optionalEnv(name);if(!value)throw new Error(`Missing Edge Function secret: ${name}`);return value};
const admin=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
function normaliseUrl(value:string){
 const cleaned=String(value||"").trim().replace(/^["']|["']$/g,"");
 if(!cleaned)return null;
 try{return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(cleaned)?cleaned:`https://${cleaned}`)}catch{return null}
}
function appUrl(){return (normaliseUrl(optionalEnv("FLORENCE_APP_URL"))||new URL(DEFAULT_APP_URL)).toString()}
function configuredOrigins(){
 const origins=new Set<string>([new URL(DEFAULT_APP_URL).origin,new URL(appUrl()).origin]);
 const raw=optionalEnv("FLORENCE_ALLOWED_ORIGINS");
 for(const item of raw.split(/[\n,]+/).map(value=>value.trim()).filter(Boolean)){const parsed=normaliseUrl(item);if(parsed)origins.add(parsed.origin)}
 return origins;
}
function originAllowed(req:Request){const origin=req.headers.get("Origin");return !origin||configuredOrigins().has(origin)}
function corsHeaders(req:Request,echoRequestOrigin=false){
 const origin=req.headers.get("Origin"),allowed=configuredOrigins();
 const selected=origin&&(allowed.has(origin)||echoRequestOrigin)?origin:[...allowed][0];
 return {"Access-Control-Allow-Origin":selected,"Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Max-Age":"86400","Vary":"Origin"};
}
const json=(req:Request,body:unknown,status=200,echoRequestOrigin=false)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders(req,echoRequestOrigin),"Content-Type":"application/json","Cache-Control":"no-store"}});
function jwtClaims(token:string):Record<string,unknown>{const part=token.split(".")[1];if(!part)throw new Error("Invalid Florence access token");const base64=part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=");const bytes=Uint8Array.from(atob(base64),character=>character.charCodeAt(0));return JSON.parse(new TextDecoder().decode(bytes))}
async function supervisorContext(req:Request){
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)throw new Error("Sign in to Florence first");
 const db=admin();const {data:{user},error:userError}=await db.auth.getUser(token);if(userError||!user)throw new Error("Your Florence session has expired");
 const claims=jwtClaims(token);if(claims.sub!==user.id||claims.aal!=="aal2")throw new Error("Multi-factor authentication is required");
 const {data:profile,error}=await db.from("profiles").select("id,organisation_id,role,active").eq("id",user.id).single();
 if(error||!profile?.active||profile.role!=="supervisor")throw new Error("Only active supervisors can manage Florence accounts");
 return {db,user,profile};
}
async function authUsers(db:ReturnType<typeof admin>){const users=[];let page=1;while(page<=10){const {data,error}=await db.auth.admin.listUsers({page,perPage:100});if(error)throw error;users.push(...data.users);if(data.users.length<100)break;page++}return users}
async function audit(db:ReturnType<typeof admin>,organisationId:string,actorId:string,action:"INSERT"|"UPDATE",recordId:string,event:string,details:Record<string,unknown>={}){const {error}=await db.from("audit_events").insert({organisation_id:organisationId,actor_id:actorId,table_name:"profiles",record_id:recordId,action,after_data:{event,...details}});if(error)throw error}
async function validateParticipant(db:ReturnType<typeof admin>,organisationId:string,participantId:string|null){
 if(!participantId)throw new Error("A family or participant portal account must be linked to a participant");
 const {data,error}=await db.from("participants").select("id").eq("id",participantId).eq("organisation_id",organisationId).single();
 if(error||!data)throw new Error("The selected participant was not found in this organisation");
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return originAllowed(req)?new Response("ok",{headers:corsHeaders(req)}):new Response("Origin not permitted",{status:403,headers:corsHeaders(req,true)});
 if(!originAllowed(req))return json(req,{error:`Request origin ${req.headers.get("Origin")||"unknown"} is not permitted`},403,true);
 try{
  if(req.method!=="POST")return json(req,{error:"POST required"},405);
  const {db,user,profile}=await supervisorContext(req),body=await req.json().catch(()=>({})),action=String(body.action||"list");
  if(action==="list"){
   const [{data:profiles,error},users]=await Promise.all([db.from("profiles").select("id,full_name,email,role,active,participant_id,created_at").eq("organisation_id",profile.organisation_id).order("full_name"),authUsers(db)]);if(error)throw error;
   const byId=new Map(users.map(account=>[account.id,account]));
   return json(req,{staff:(profiles||[]).map(account=>{const authAccount=byId.get(account.id);return {...account,email:account.email||authAccount?.email||null,last_sign_in_at:authAccount?.last_sign_in_at||null,email_confirmed_at:authAccount?.email_confirmed_at||null,banned_until:authAccount?.banned_until||null}})});
  }
  if(action==="invite"){
   const email=String(body.email||"").trim().toLowerCase(),fullName=String(body.full_name||"").trim(),allowedRoles=["staff","supervisor","family","client"],role=allowedRoles.includes(body.role)?String(body.role):"staff",participantId=["family","client"].includes(role)?String(body.participant_id||""):null;
   if(!fullName||!/^\S+@\S+\.\S+$/.test(email))throw new Error("A valid name and email are required");if(["family","client"].includes(role))await validateParticipant(db,profile.organisation_id,participantId);
   const users=await authUsers(db);let invitedUser=users.find(account=>String(account.email||"").toLowerCase()===email)||null;const existing=!!invitedUser;
   if(invitedUser){const {data:existingProfile,error:lookupError}=await db.from("profiles").select("id,organisation_id").eq("id",invitedUser.id).maybeSingle();if(lookupError)throw lookupError;if(existingProfile&&existingProfile.organisation_id!==profile.organisation_id)throw new Error("This email is already linked to another Florence organisation")}
   if(!invitedUser){const creationRole=["family","client"].includes(role)?"staff":role;const {data,error}=await db.auth.admin.inviteUserByEmail(email,{redirectTo:appUrl(),data:{full_name:fullName,organisation_id:profile.organisation_id,role:creationRole,requested_role:role,participant_id:participantId}});if(error||!data.user)throw new Error(error?.message||"Invitation could not be created");invitedUser=data.user}
   else{const {error}=await db.auth.admin.updateUserById(invitedUser.id,{user_metadata:{...invitedUser.user_metadata,full_name:fullName,organisation_id:profile.organisation_id,role,participant_id:participantId}});if(error)throw error}
   const {error:profileError}=await db.from("profiles").upsert({id:invitedUser.id,organisation_id:profile.organisation_id,participant_id:participantId,full_name:fullName,email,role,active:true},{onConflict:"id"});if(profileError){if(!existing)await db.auth.admin.deleteUser(invitedUser.id);throw profileError}
   await audit(db,profile.organisation_id,user.id,existing?"UPDATE":"INSERT",invitedUser.id,existing?"account_linked":"account_invited",{role,participant_id:participantId});
   return json(req,{success:true,user_id:invitedUser.id,existing,requires_password_reset:existing,email});
  }
  if(action==="set-active"){
   const userId=String(body.user_id||""),active=body.active===true;if(!userId)throw new Error("Florence account is required");if(userId===user.id&&!active)throw new Error("You cannot deactivate your own account");
   const {data:target,error}=await db.from("profiles").select("id,role,active").eq("id",userId).eq("organisation_id",profile.organisation_id).single();if(error||!target)throw new Error("Florence account not found");
   if(!active&&target.role==="supervisor"){const {count}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("organisation_id",profile.organisation_id).eq("role","supervisor").eq("active",true);if((count||0)<=1)throw new Error("Florence must keep at least one active supervisor")}
   const {error:authError}=await db.auth.admin.updateUserById(userId,{ban_duration:active?"none":"876000h"});if(authError)throw authError;
   const {error:updateError}=await db.from("profiles").update({active}).eq("id",userId).eq("organisation_id",profile.organisation_id);if(updateError)throw updateError;
   await audit(db,profile.organisation_id,user.id,"UPDATE",userId,active?"account_reactivated":"account_deactivated",{role:target.role});return json(req,{success:true});
  }
  if(action==="set-role"){
   const userId=String(body.user_id||""),allowedRoles=["staff","supervisor","family","client"],role=allowedRoles.includes(body.role)?String(body.role):"staff",participantId=["family","client"].includes(role)?String(body.participant_id||""):null;
   if(["family","client"].includes(role))await validateParticipant(db,profile.organisation_id,participantId);
   const {data:target,error}=await db.from("profiles").select("id,role,active").eq("id",userId).eq("organisation_id",profile.organisation_id).single();if(error||!target)throw new Error("Florence account not found");
   if(target.role==="supervisor"&&role!=="supervisor"&&target.active){const {count}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("organisation_id",profile.organisation_id).eq("role","supervisor").eq("active",true);if((count||0)<=1)throw new Error("Florence must keep at least one active supervisor")}
   const {data:{user:authUser},error:authLookupError}=await db.auth.admin.getUserById(userId);if(authLookupError||!authUser)throw new Error("The authentication account was not found");
   const {error:authError}=await db.auth.admin.updateUserById(userId,{user_metadata:{...authUser.user_metadata,role,participant_id:participantId}});if(authError)throw authError;
   const {error:updateError}=await db.from("profiles").update({role,participant_id:participantId}).eq("id",userId).eq("organisation_id",profile.organisation_id);if(updateError)throw updateError;
   await audit(db,profile.organisation_id,user.id,"UPDATE",userId,"role_changed",{from:target.role,to:role,participant_id:participantId});return json(req,{success:true});
  }
  return json(req,{error:"Unknown staff-management action"},400);
 }catch(error){const record=error&&typeof error==="object"?error as Record<string,unknown>:null;const message=error instanceof Error?error.message:String(record?.message||record?.error_description||record?.details||record?.hint||record?.code||error||"Staff management failed");console.error("staff-management error:",message);return json(req,{error:message},400)}
});
