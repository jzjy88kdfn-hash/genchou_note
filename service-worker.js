const CACHE='genchou-note-v4';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  event.respondWith(
    caches.open(CACHE).then(cache=>
      globalThis.fetch(event.request).then(response=>{
        cache.put(event.request,response.clone());
        return response;
      }).catch(()=>cache.match(event.request).then(found=>found||cache.match('./index.html')))
    )
  );
});
