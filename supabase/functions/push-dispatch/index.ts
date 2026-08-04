import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.2";
import webpush from "npm:web-push@3.6.7";

const required=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error(`Missing required secret: ${name}`);return value};
const schedulerSecret=required("PUSH_SCHEDULER_SECRET");
webpush.setVapidDetails("mailto:admin@icareconnect.com.au",required("PUSH_VAPID_PUBLIC_KEY"),required("PUSH_VAPID_PRIVATE_KEY"));
const db=createClient(required("SUPABASE_URL"),required("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const secureEqual=async(a:string,b:string)=>{const encoder=new TextEncoder();const [x,y]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(a)),crypto.subtle.digest("SHA-256",encoder.encode(b))]);const left=new Uint8Array(x),right=new Uint8Array(y);let diff=0;for(let i=0;i<left.length;i++)diff|=left[i]^right[i];return diff===0};

async function dispatchQueued(){
 const {data:jobs,error}=await db.from("push_notification_jobs").select("*").eq("status","queued").lte("send_after",new Date().toISOString()).order("created_at").limit(100);
 if(error)throw error;
 let sent=0,failed=0;
 for(const job of jobs||[]){
  const {data:claimed,error:claimError}=await db.from("push_notification_jobs").update({status:"sending",attempt_count:(job.attempt_count||0)+1}).eq("id",job.id).eq("status","queued").select("id");
  if(claimError)throw claimError;
  if(!claimed?.length)continue;
  const {data:subs,error:subsError}=await db.from("push_subscriptions").select("id,endpoint,p256dh,auth_secret").eq("user_id",job.recipient_id).eq("active",true);
  if(subsError)throw subsError;
  let delivered=false,lastError="";
  for(const sub of subs||[]){
   try{
    await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_secret}},JSON.stringify({title:job.title,body:job.body,category:job.category,url:job.target_url,tag:job.dedupe_key}),{TTL:600,urgency:job.category==="Medication"?"high":"normal"});
    delivered=true;sent++;
   }catch(error){
    const status=(error as any)?.statusCode;lastError=String((error as any)?.message||error);failed++;
    if(status===404||status===410)await db.from("push_subscriptions").update({active:false,updated_at:new Date().toISOString()}).eq("id",sub.id);
   }
  }
  const attempts=(job.attempt_count||0)+1;
  const update=delivered?{status:"sent",sent_at:new Date().toISOString(),last_error:null}:{status:attempts>=3?"failed":"queued",last_error:lastError||"No active push subscription",send_after:new Date(Date.now()+5*60000).toISOString()};
  const {error:updateError}=await db.from("push_notification_jobs").update(update).eq("id",job.id);
  if(updateError)throw updateError;
 }
 return {jobs:(jobs||[]).length,sent,failed};
}

Deno.serve(async req=>{
 if(req.method!=="POST")return json({error:"Method not allowed"},405);
 if(!await secureEqual(req.headers.get("X-Florence-Scheduler")||"",schedulerSecret))return json({error:"Not authorised"},401);
 try{
  const result=await dispatchQueued();
  return json({ok:true,...result});
 }catch(error){
  console.error("push-dispatch failed",error);
  return json({error:String((error as any)?.message||error)},500);
 }
});
