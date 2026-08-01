(() => {
"use strict";

// Supabase PostgREST builders are awaitable, but they do not expose a native
// Promise .catch() method. The SIL workspace's non-blocking audit calls use
// .catch(), so convert only record_access_event RPC calls into native Promises.
// Other RPC calls retain the normal Supabase builder behaviour.
const sdk=window.supabase;
if(!sdk||typeof sdk.createClient!=="function")return;

const originalCreateClient=sdk.createClient.bind(sdk);
sdk.createClient=(...args)=>{
 const client=originalCreateClient(...args);
 if(!client||typeof client.rpc!=="function")return client;

 const originalRpc=client.rpc.bind(client);
 client.rpc=(functionName,functionArgs,options)=>{
  const request=originalRpc(functionName,functionArgs,options);
  return functionName==="record_access_event"
   ?Promise.resolve(request)
   :request;
 };
 return client;
};
})();
