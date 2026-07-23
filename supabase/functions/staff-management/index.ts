import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const env=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error(`Missing Edge Function secret: ${name}`);return value};
const admin=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false}});
async function supervisorContext(req:Request){
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)throw new Error("Sign in to Florence first");
 const db=admin();
 const {data:{user},error:userError}=await db.auth.getUser(token);
 if(userError||!user)throw new Error("Your Florence session has expired");
 const {data:profile,error}=await db.from("profiles").select("id,organisation_id,role,active").eq("id",user.id).single();
 if(error||!profile?.active||profile.role!=="supervisor")throw new Error("Only active supervisors can manage staff");
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
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 try{
  if(req.method!=="POST")return json({error:"POST required"},405);
  const {db,user,profile}=await supervisorContext(req);
  const body=await req.json().catch(()=>({}));
  const action=body.action||"list";
  if(action==="list"){
   const [{data:profiles,error},users]=await Promise.all([
    db.from("profiles").select("id,full_name,email,role,active,created_at").eq("organisation_id",profile.organisation_id).in("role",["staff","supervisor"]).order("full_name"),
    authUsers(db)
   ]);
   if(error)throw error;
   const byId=new Map(users.map(x=>[x.id,x]));
   return json({staff:(profiles||[]).map(x=>{const auth=byId.get(x.id);return {...x,email:x.email||auth?.email||null,last_sign_in_at:auth?.last_sign_in_at||null,email_confirmed_at:auth?.email_confirmed_at||null,banned_until:auth?.banned_until||null}})});
  }
  if(action==="invite"){
   const email=String(body.email||"").trim().toLowerCase(),fullName=String(body.full_name||"").trim(),role=body.role==="supervisor"?"supervisor":"staff";
   if(!email||!fullName)throw new Error("Worker name and email are required");
   const users=await authUsers(db);
   let invitedUser=users.find(x=>String(x.email||"").toLowerCase()===email)||null;
   const existing=!!invitedUser;
   if(!invitedUser){
    const redirectTo=Deno.env.get("FLORENCE_APP_URL")||undefined;
    const {data,error}=await db.auth.admin.inviteUserByEmail(email,{redirectTo,data:{full_name:fullName,organisation_id:profile.organisation_id,role}});
    if(error||!data.user)throw new Error(error?.message||"Invitation could not be created");
    invitedUser=data.user;
   }else{
    const {error:authError}=await db.auth.admin.updateUserById(invitedUser.id,{user_metadata:{...invitedUser.user_metadata,full_name:fullName,organisation_id:profile.organisation_id,role}});
    if(authError)throw new Error(authError.message||"The existing worker account could not be updated");
   }
   const {error:profileError}=await db.from("profiles").upsert({id:invitedUser.id,organisation_id:profile.organisation_id,full_name:fullName,email,role,active:true},{onConflict:"id"});
   if(profileError){if(!existing)await db.auth.admin.deleteUser(invitedUser.id);throw profileError}
   return json({success:true,user_id:invitedUser.id,existing,requires_password_reset:existing,email});
  }
  if(action==="set-active"){
   const userId=String(body.user_id||""),active=body.active===true;
   if(!userId)throw new Error("Worker account is required");
   if(userId===user.id&&!active)throw new Error("You cannot deactivate your own account");
   const {data:target,error:targetError}=await db.from("profiles").select("id,role").eq("id",userId).eq("organisation_id",profile.organisation_id).single();
   if(targetError||!target)throw new Error("Worker account not found");
   if(!active&&target.role==="supervisor"){
    const {count}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("organisation_id",profile.organisation_id).eq("role","supervisor").eq("active",true);
    if((count||0)<=1)throw new Error("Florence must keep at least one active supervisor");
   }
   const {error:authError}=await db.auth.admin.updateUserById(userId,{ban_duration:active?"none":"876000h"});
   if(authError)throw authError;
   const {error}=await db.from("profiles").update({active}).eq("id",userId).eq("organisation_id",profile.organisation_id);
   if(error)throw error;
   return json({success:true});
  }
  if(action==="set-role"){
   const userId=String(body.user_id||""),role=body.role==="supervisor"?"supervisor":"staff";
   const {data:target,error:targetError}=await db.from("profiles").select("id,role,active").eq("id",userId).eq("organisation_id",profile.organisation_id).single();
   if(targetError||!target)throw new Error("Worker account not found");
   if(target.role==="supervisor"&&role!=="supervisor"&&target.active){
    const {count}=await db.from("profiles").select("id",{count:"exact",head:true}).eq("organisation_id",profile.organisation_id).eq("role","supervisor").eq("active",true);
    if((count||0)<=1)throw new Error("Florence must keep at least one active supervisor");
   }
   const {error}=await db.from("profiles").update({role}).eq("id",userId).eq("organisation_id",profile.organisation_id);
   if(error)throw error;
   return json({success:true});
  }
  return json({error:"Unknown staff-management action"},400);
 }catch(error){
  const record=error&&typeof error==="object"?error as Record<string,unknown>:null;
  const message=error instanceof Error?error.message:String(record?.message||record?.error_description||record?.details||record?.hint||record?.code||error||"Staff management failed");
  console.error("staff-management error:",message,record?JSON.stringify(record):String(error));
  return json({error:message},400);
 }
});
