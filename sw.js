// Service worker : l'application fonctionne hors ligne une fois chargée.
const VERSION = 'mes-revisions-v1';
const RUNTIME = 'mes-revisions-runtime-v1';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/app.js', 'js/util.js', 'js/db.js', 'js/fsrs.js', 'js/settings.js', 'js/text.js', 'js/store.js',
  'js/queue.js', 'js/ui.js', 'js/gemini.js', 'js/ai.js', 'js/local-ai.js', 'js/ocr.js', 'js/export.js',
  'js/wiki.js', 'js/components.js', 'js/pwa.js',
  'js/views/home.js', 'js/views/courses.js', 'js/views/course.js', 'js/views/importer.js', 'js/views/generate.js',
  'js/views/workshop.js', 'js/views/review.js', 'js/views/source.js', 'js/views/settings.js',
];

// Bibliothèques externes mises en cache au premier usage (lecteur PDF, lecture d'image sur l'appareil).
const CACHEABLE_HOSTS = ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // Réseau d'abord pour avoir la dernière version, cache en secours hors ligne.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(VERSION).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
    );
    return;
  }

  if (CACHEABLE_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(RUNTIME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      }),
    );
  }
  // Les appels à Gemini et Wikipédia passent directement par le réseau.
});
