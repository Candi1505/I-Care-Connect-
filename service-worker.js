const CACHE="florence-shell-20260802-3";
const SHELL=["./","./index.html","./styles.css?v=20260801-1","./config.js","./app.js?v=20260802-1","./operations.js?v=20260802-1","./staff-management.js?v=20260801-1","./setup-code-display.js?v=20260802-1","./portal-participant-label.js?v=20260802-1","./sil.html","./sil.css?v=20260731-1","./sil.js?v=20260801-4","./manifest.webmanifest","./florence-icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
async function prepareResponse(request,response){
 const url=new URL(request.url);
 const type=response.headers.get("content-type")||"";
 if(request.mode==="navigate"&&url.pathname.endsWith("/")&&type.includes("text/html")){
  let html=await response.text();
  if(!html.includes("setup-code-display.js"))html=html.replace("</body>",'<script src="setup-code-display.js?v=20260802-1"></script></body>');
  if(!html.includes("portal-participant-label.js"))html=html.replace("</body>",'<script src="portal-participant-label.js?v=20260802-1"></script></body>');
  return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
 }
 return response;
}
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.endsWith("/set-password.html"))return;
 event.respondWith(fetch(event.request).then(async response=>{
  const prepared=await prepareResponse(event.request,response);
  if(prepared.ok){const copy=prepared.clone();void caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
  return prepared;
 }).catch(()=>caches.match(event.request).then(hit=>hit||new Response("Florence is temporarily offline.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}))));
});
