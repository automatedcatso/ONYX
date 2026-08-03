const CACHE = "onyx-shell-v3";
const SHELL = [
  "/art/gothic-moon-cathedral.webp",
  "/art/cathedral-courtyard.webp",
  "/art/red-sun-temple.webp",
  "/art/onyx-wave.webp",
  "/art/alias-manifesto.webp",
  "/onyx-icon.svg",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request, { cache: "no-store" })));
  }
});
