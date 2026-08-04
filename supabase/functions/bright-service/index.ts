import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ORIGIN="https://i-care-connect.candi1505.workers.dev";
const headers={
 "Access-Control-Allow-Origin":ORIGIN,
 "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
 "Access-Control-Allow-Methods":"POST, OPTIONS",
 "Content-Type":"application/json",
 "Cache-Control":"no-store"
};

Deno.serve((req:Request)=>{
 const origin=req.headers.get("Origin");
 if(origin&&origin!==ORIGIN)return new Response(JSON.stringify({error:"Request origin is not permitted"}),{status:403,headers});
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 return new Response(JSON.stringify({error:"This legacy endpoint has been retired."}),{status:410,headers});
});
