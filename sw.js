/* Real Price service worker: app shell precache + runtime cache of same-origin GETs (incl. the OCR engine & language data). */
const VERSION = 'rp-v1';
const SHELL = ['./', 'index.html', 'style.css', 'js/logic.js', 'js/app.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'vendor/tesseract/tesseract.min.js', 'vendor/tesseract/worker.min.js'];
const OCR_ASSETS = ['vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js', 'vendor/tesseract/core/tesseract-core-lstm.wasm.js', 'vendor/tesseract/lang/eng.traineddata.gz'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    // Big OCR files: best effort so a flaky connection doesn't block install.
    await Promise.all(OCR_ASSETS.map((u) => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(req, { ignoreSearch: true });
    // Code files: stale-while-revalidate so updates arrive on the next load. Big OCR assets: cache-first.
    const net = fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { if (!/vendor\/tesseract\/(core|lang)/.test(url.pathname)) e.waitUntil(net); return hit; }
    const r = await net;
    if (r) return r;
    if (req.mode === 'navigate') return (await c.match('index.html')) || Response.error();
    return Response.error();
  })());
});
