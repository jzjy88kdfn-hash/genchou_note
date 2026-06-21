const CACHE='genchou-note-v8';
const ASSETS=['./','./index.html','./style.css','./save.css','./app.js','./save.js','./common-items.js','./common-sets.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(caches.match(event.request).then(found=>found||fetch(event.request).then(response=>response).catch(()=>caches.match('./index.html'))));
});
