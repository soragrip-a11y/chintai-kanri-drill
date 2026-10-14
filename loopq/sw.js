const CACHE='loopq-v20-original-import-20261014';const ASSETS=['./','./index.html','./safety.js','./backup.js','./style.css','./bright.css','./runtime-config.js','./ai-bridge.js','./batch.js','./pasted-json.js','./original-import.js','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(x=>x.startsWith('loopq-')&&x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone)).catch(()=>{})}return r}).catch(()=>caches.match(e.request)))});

