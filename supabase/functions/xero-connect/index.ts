import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const env=(name:string)=>{
 const value=Deno.env.get(name);
 if(!value)throw new Error(`Missing Edge Function secret: ${name}`);
 return value;
};
const admin=()=>createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{
 auth:{persistSession:false,autoRefreshToken:false}
});
const basic=()=>btoa(`${env("XERO_CLIENT_ID")}:${env("XERO_CLIENT_SECRET")}`);

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
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
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

async function exchangeToken(params:URLSearchParams){
 const response=await fetch("https://identity.xero.com/connect/token",{
  method:"POST",
  headers:{"Authorization":`Basic ${basic()}`,"Content-Type":"application/x-www-form-urlencoded"},
  body:params
 });
 const body=await response.json();
 if(!response.ok)throw new Error(body.error_description||body.error||"Xero token exchange failed");
 return body;
}

async function authenticatedContext(req:Request){
 const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
 if(!token)throw new Error("Sign in to Florence first");
 const db=admin();
 const {data:{user},error:userError}=await db.auth.getUser(token);
 if(userError||!user)throw new Error("Your Florence session has expired");
 const claims=jwtClaims(token);
 if(claims.sub!==user.id||claims.aal!=="aal2")throw new Error("Multi-factor authentication is required");
 const {data:profile,error}=await db.from("profiles")
  .select("id,organisation_id,role,active").eq("id",user.id).single();
 if(error||!profile?.active)throw new Error("Active Florence profile not found");
 if(profile.role!=="supervisor")throw new Error("Only active supervisors can manage Xero");
 return {db,user,profile};
}

async function audit(
 db:ReturnType<typeof admin>,organisationId:string,actorId:string,
 event:string,details:Record<string,unknown>={}
){
 const {error}=await db.from("audit_events").insert({
  organisation_id:organisationId,actor_id:actorId,table_name:"xero_connections",
  action:"UPDATE",after_data:{event,...details}
 });
 if(error)throw error;
}

async function validConnection(db:ReturnType<typeof admin>,organisationId:string){
 const {data:connection,error}=await db.from("xero_connections")
  .select("*").eq("organisation_id",organisationId).maybeSingle();
 if(error)throw error;
 if(!connection)return null;
 if(new Date(connection.expires_at).getTime()>Date.now()+60000)return connection;
 const token=await exchangeToken(new URLSearchParams({
  grant_type:"refresh_token",refresh_token:connection.refresh_token
 }));
 const updated={
  ...connection,access_token:token.access_token,refresh_token:token.refresh_token,
  expires_at:new Date(Date.now()+token.expires_in*1000).toISOString(),
  scopes:token.scope||connection.scopes,updated_at:new Date().toISOString()
 };
 const {error:updateError}=await db.from("xero_connections")
  .upsert(updated,{onConflict:"organisation_id"});
 if(updateError)throw updateError;
 return updated;
}

async function callback(req:Request){
 const url=new URL(req.url);
 const state=url.searchParams.get("state");
 const code=url.searchParams.get("code");
 if(!state||!code){
  throw new Error(url.searchParams.get("error_description")||"Xero did not return an authorisation code");
 }
 const db=admin();
 const {data:pending,error}=await db.from("xero_oauth_states")
  .select("*").eq("state",state).gt("expires_at",new Date().toISOString()).maybeSingle();
 if(error||!pending)throw new Error("This Xero connection request has expired. Start again from Florence.");
 const {data:profile,error:profileError}=await db.from("profiles")
  .select("id,organisation_id,role,active").eq("id",pending.user_id)
  .eq("organisation_id",pending.organisation_id).single();
 if(profileError||!profile?.active||profile.role!=="supervisor"){
  throw new Error("The supervisor who started this Xero connection is no longer authorised");
 }

 const token=await exchangeToken(new URLSearchParams({
  grant_type:"authorization_code",code,redirect_uri:env("XERO_REDIRECT_URI")
 }));
 const connectionsResponse=await fetch("https://api.xero.com/connections",{
  headers:{Authorization:`Bearer ${token.access_token}`}
 });
 const connections=await connectionsResponse.json();
 if(!connectionsResponse.ok||!Array.isArray(connections)||!connections.length){
  throw new Error("No Xero organisation was authorised");
 }
 const tenant=connections[0];
 const {error:saveError}=await db.from("xero_connections").upsert({
  organisation_id:pending.organisation_id,
  tenant_id:tenant.tenantId,tenant_name:tenant.tenantName,
  access_token:token.access_token,refresh_token:token.refresh_token,
  expires_at:new Date(Date.now()+token.expires_in*1000).toISOString(),
  scopes:token.scope,connected_by:pending.user_id,
  connected_at:new Date().toISOString(),updated_at:new Date().toISOString()
 },{onConflict:"organisation_id"});
 if(saveError)throw saveError;
 await db.from("xero_oauth_states").delete().eq("state",state);
 await audit(db,pending.organisation_id,pending.user_id,"xero_connected",{tenant_name:tenant.tenantName||null});
 const destination=new URL(env("FLORENCE_APP_URL"));
 destination.searchParams.set("xero","connected");
 return Response.redirect(destination.toString(),302);
}

Deno.serve(async req=>{
 const url=new URL(req.url);
 const isCallback=req.method==="GET"&&url.searchParams.get("action")==="callback";
 if(!isCallback&&!originAllowed(req))return json(req,{error:"Request origin is not permitted"},403);
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(req)});
 try{
  if(isCallback)return await callback(req);
  const {db,user,profile}=await authenticatedContext(req);
  const body=req.method==="POST"
   ?await req.json().catch(()=>({}))
   :Object.fromEntries(url.searchParams);
  const action=String(body.action||"status");

  if(action==="start"){
   await db.from("xero_oauth_states").delete().lt("expires_at",new Date().toISOString());
   const state=crypto.randomUUID()+crypto.randomUUID();
   const {error}=await db.from("xero_oauth_states").insert({
    state,organisation_id:profile.organisation_id,user_id:profile.id,
    expires_at:new Date(Date.now()+10*60*1000).toISOString()
   });
   if(error)throw error;
   const auth=new URL("https://login.xero.com/identity/connect/authorize");
   auth.search=new URLSearchParams({
    response_type:"code",client_id:env("XERO_CLIENT_ID"),
    redirect_uri:env("XERO_REDIRECT_URI"),
    scope:"openid profile email accounting.transactions accounting.contacts offline_access",
    state
   }).toString();
   return json(req,{authorization_url:auth.toString()});
  }

  if(action==="status"){
   const connection=await validConnection(db,profile.organisation_id);
   return json(req,{
    connected:!!connection,tenant_name:connection?.tenant_name||null,
    connected_at:connection?.connected_at||null
   });
  }

  if(action==="disconnect"){
   const connection=await validConnection(db,profile.organisation_id);
   if(connection){
    await fetch("https://identity.xero.com/connect/revocation",{
     method:"POST",
     headers:{"Authorization":`Basic ${basic()}`,"Content-Type":"application/x-www-form-urlencoded"},
     body:new URLSearchParams({token:connection.refresh_token})
    });
   }
   const {error}=await db.from("xero_connections")
    .delete().eq("organisation_id",profile.organisation_id);
   if(error)throw error;
   await audit(db,profile.organisation_id,user.id,"xero_disconnected");
   return json(req,{connected:false});
  }

  if(action==="sync-invoice"){
   const connection=await validConnection(db,profile.organisation_id);
   if(!connection)throw new Error("Connect Xero before sending an invoice");
   const {data:invoice,error}=await db.from("invoices")
    .select("*,participant:participants(full_name)")
    .eq("id",body.invoice_id).eq("organisation_id",profile.organisation_id).single();
   if(error||!invoice)throw new Error("Invoice not found");
   if(invoice.xero_invoice_id)throw new Error("This invoice has already been sent to Xero");
   const xeroBody={Invoices:[{
    Type:"ACCREC",
    Contact:{Name:invoice.participant?.full_name||"NDIS Participant"},
    Date:invoice.invoice_date,DueDate:invoice.due_date||invoice.invoice_date,
    Reference:invoice.invoice_number,Status:"DRAFT",
    LineItems:[{
     Description:invoice.description,Quantity:Number(invoice.hours),
     UnitAmount:Number(invoice.rate),AccountCode:env("XERO_SALES_ACCOUNT_CODE")
    }]
   }]};
   const response=await fetch("https://api.xero.com/api.xro/2.0/Invoices",{
    method:"POST",
    headers:{
     "Authorization":`Bearer ${connection.access_token}`,
     "Xero-tenant-id":connection.tenant_id,
     "Content-Type":"application/json","Accept":"application/json"
    },
    body:JSON.stringify(xeroBody)
   });
   const result=await response.json();
   if(!response.ok){
    throw new Error(result?.Elements?.[0]?.ValidationErrors?.[0]?.Message||"Xero rejected the invoice");
   }
   const xeroInvoice=result?.Invoices?.[0];
   const {error:updateError}=await db.from("invoices").update({
    xero_invoice_id:xeroInvoice?.InvoiceID,status:"Sent to Xero"
   }).eq("id",invoice.id).eq("organisation_id",profile.organisation_id);
   if(updateError)throw updateError;
   await audit(db,profile.organisation_id,user.id,"invoice_synced",{invoice_id:invoice.id});
   return json(req,{success:true,xero_invoice_id:xeroInvoice?.InvoiceID});
  }

  return json(req,{error:"Unknown action"},400);
 }catch(error){
  const message=error instanceof Error?error.message:"Xero connection failed";
  console.error("xero-connect error:",message);
  return json(req,{error:message},400);
 }
});
