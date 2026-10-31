/* Real Price service worker. OCR assets are NOT intercepted: iOS Safari fails
   importScripts() of the Tesseract worker/wasm when a service worker responds. */
const VERSION = 'rp-v7';
const SHELL = ['./', 'index.html', 'style.css', 'js/logic.js', 'js/app.js', 'manifest.json',
  'favicon.ico', 'icons/favicon-32.png', 'icons/mark.png', 'icons/logo.png', 'icons/apple-touch-icon.png',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'vendor/fonts/noto-sans-latin.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
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
  if (url.pathname.indexOf('/vendor/tesseract/') !== -1) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((r) => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const r = await net;
    if (r) return r;
    if (req.mode === 'navigate') return (await c.match('index.html')) || Response.error();
    return Response.error();
  })());
});
