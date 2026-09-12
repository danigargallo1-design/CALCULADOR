/* =========================================================
   SERVICE WORKER — CALCULADORA PWA
   Estrategia sencilla:
   - Precache de los archivos esenciales al instalar.
   - Cache-first para los archivos precacheados.
   - Network-first como fallback para el resto.
   - Limpieza de cachés antiguos en activate.
   ========================================================= */

"use strict";

const CACHE_VERSION = "calc-v1";
const CACHE_NAME    = `calculadora-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-512-maskable.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png"
];


/* =========================================================
   INSTALL — precache
   ========================================================= */

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(() => {
        /* Si algún asset falla no bloqueamos la instalación */
      });
    }).then(() => self.skipWaiting())
  );
});


/* =========================================================
   ACTIVATE — limpieza
   ========================================================= */

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});


/* =========================================================
   FETCH — cache-first con fallback a red
   ========================================================= */

self.addEventListener("fetch", event => {

  const request = event.request;

  /* Solo cacheamos GET del mismo origen */
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Para la navegación (documento), servir index.html offline */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("./index.html").then(res => res || caches.match("./"))
      )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).then(response => {

        /* Cachear respuestas válidas para futuras visitas */
        if (
          response &&
          response.status === 200 &&
          response.type === "basic"
        ) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }

        return response;
      }).catch(() => cached);
    })
  );
});


/* =========================================================
   MESSAGE — permite activar update inmediato desde la app
   ========================================================= */

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
