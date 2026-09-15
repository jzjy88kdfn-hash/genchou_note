"use strict";
const CACHE="genchou-note-v9-20260916-release-01";
const PREFIX="genchou-note-";
const LEGACY_PREFIX="field-survey-ledger-";
const CORE=[
  "./",
  "./index.html",
  "./app-next.css?v=5",
  "./app-next-01.js?v=5",
  "./app-next-02.js?v=5",
  "./app-next-03a1.js?v=5",
  "./app-next-03a2a.js?v=5",
  "./app-next-03a2b.js?v=5",
  "./app-next-03b.js?v=5",
  "./app-next-03c.js?v=5",
  "./app-next-04a1.js?v=5",
  "./app-next-04a2.js?v=5",
  "./app-next-04b1.js?v=5",
  "./app-next-04b2.js?v=5",
  "./access.js",
  "./manifest.webmanifest?v=7",
  "./icons/icon-genchou-1254.png?v=1"
];
self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>(k.startsWith(PREFIX)||k.startsWith(LEGACY_PREFIX))&&k!==CACHE).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  const quantityPath=new URL("./paint-quantity/",self.location.href).pathname;
  if(url.pathname.startsWith(quantityPath))return;
  if(req.mode==="navigate"){
    event.respondWith(fetch(req).then(async fresh=>{
      if(fresh&&fresh.ok){const c=await caches.open(CACHE);c.put("./index.html",fresh.clone()).catch(()=>{});}
      return fresh;
    }).catch(()=>caches.open(CACHE).then(c=>c.match("./index.html"))));
    return;
  }
  event.respondWith(caches.open(CACHE).then(c=>c.match(req,{ignoreSearch:true})).then(cached=>cached||fetch(req).then(async fresh=>{
    if(fresh&&fresh.ok){const c=await caches.open(CACHE);c.put(req,fresh.clone()).catch(()=>{});}
    return fresh;
  })));
});
