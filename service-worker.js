const CACHE="florence-shell-20260802-13";
const SHELL=["./","./index.html","./styles.css?v=20260801-1","./config.js","./app.js?v=20260802-1","./operations.js?v=20260802-1","./staff-management.js?v=20260801-1","./mobile-session-push-fix.js?v=20260802-1","./setup-code-display.js?v=20260802-1","./portal-participant-label.js?v=20260802-2","./portal-care-plan.js?v=20260802-1","./medication-prn-fix.js?v=20260802-1","./regular-medication-tab.js?v=20260802-1","./florence-readiness-controls.js?v=20260802-1","./remote-s8-verification.js?v=20260802-1","./sil.html","./sil.css?v=20260731-1","./sil.js?v=20260801-4","./manifest.webmanifest","./florence-icon.svg"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 if(event.request.method!=="GET")return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.endsWith("/set-password.html"))return;
 event.respondWith(fetch(event.request).then(response=>{
  if(response.ok){const copy=response.clone();void caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
  return response;
 }).catch(()=>caches.match(event.request).then(hit=>hit||new Response("Florence is temporarily offline.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}))));
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
