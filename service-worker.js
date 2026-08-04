const CACHE="florence-shell-20260804-2";
const CORE_FIX="./core-ui-fixes-v3.js?v=20260804-1";
const DEPUTY_UI="./deputy-integration.js?v=20260804-2";
const SHELL=["./","./index.html","./styles.css?v=20260801-1","./config.js","./app.js?v=20260802-1","./operations.js?v=20260802-1","./staff-management.js?v=20260801-1","./setup-code-display.js?v=20260802-4","./live-refresh-controls.js?v=20260802-2","./notification-navigation.js?v=20260802-2",CORE_FIX,DEPUTY_UI,"./core-ui-fixes-v2.js?v=20260804-1","./portal-participant-label.js?v=20260802-2","./portal-care-plan.js?v=20260803-2","./medication-prn-fix.js?v=20260804-2","./regular-medication-tab.js?v=20260804-2","./florence-readiness-controls.js?v=20260802-1","./remote-s8-verification.js?v=20260802-1","./sil.html","./sil.css?v=20260731-1","./sil.js?v=20260801-4","./manifest.webmanifest","./florence-icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));

async function withRuntimeFixes(response){
 const type=response.headers.get("content-type")||"";
 if(!response.ok||!type.includes("text/html"))return response;
 let html=await response.text();
 html=html.replace(/<script[^>]+src=["'][^"']*core-ui-fixes-v[23]\.js[^"']*["'][^>]*><\/script>/gi,"");
 html=html.replace(/<script[^>]+src=["'][^"']*participant-actions-direct\.js[^"']*["'][^>]*><\/script>/gi,"");
 html=html.replace(/<script[^>]+src=["'][^"']*deputy-integration\.js[^"']*["'][^>]*><\/script>/gi,"");
 const scripts=`<script src="${CORE_FIX}"></script><script src="${DEPUTY_UI}"></script>`;
 html=html.includes("</body>")?html.replace("</body>",`${scripts}</body>`):html+scripts;
 const headers=new Headers(response.headers);
 headers.delete("content-length");
 headers.delete("content-encoding");
 headers.set("cache-control","no-store");
 return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.endsWith("/set-password.html"))return;
 event.respondWith((async()=>{
  try{
   const network=await fetch(event.request,{cache:"no-store"});
   const response=event.request.mode==="navigate"||network.headers.get("content-type")?.includes("text/html")?await withRuntimeFixes(network):network;
   if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
   return response;
  }catch(_error){
   const hit=await caches.match(event.request);
   if(hit)return event.request.mode==="navigate"?withRuntimeFixes(hit):hit;
   return new Response("Florence is temporarily offline.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
  }
 })());
});
self.addEventListener("push",event=>{
 let payload={title:"Florence",body:"A new Florence alert is available.",url:"./",tag:"florence-alert"};
 try{if(event.data)payload={...payload,...event.data.json()}}catch(_error){}
 event.waitUntil(self.registration.showNotification(payload.title,{body:payload.body,icon:"./florence-icon.svg",badge:"./florence-icon.svg",tag:payload.tag,renotify:true,data:{url:payload.url||"./"}}));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const target=new URL(event.notification.data?.url||"./",self.location.origin).href;
 event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(windows=>{for(const client of windows){if("focus" in client){client.navigate(target);return client.focus()}}return clients.openWindow?clients.openWindow(target):undefined}));
});