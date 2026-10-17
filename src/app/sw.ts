/// <reference lib="webworker" />
// Service worker, bundled by Serwist at build time (src/app/serwist/[path]/route.ts).
// Precaches the app shell (every screen's HTML) and build files; runtime-caches the rest.
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheableResponsePlugin, CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Screens take their options from the query string (/train/session?id=A), and every variant is
  // the same static page, so the query is ignored when matching the precache.
  precacheOptions: { ignoreURLParametersMatching: [/.*/], cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Food lookups (USDA, Open Food Facts) always go to the network.
    { matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    // Exercise demos: the build's /media copies, and the ExerciseDB/wger originals (opaque when
    // fetched ahead of time with no-cors, hence status 0).
    {
      matcher: ({ url, sameOrigin }) =>
        (sameOrigin && url.pathname.startsWith("/media/")) ||
        url.hostname === "static.exercisedb.dev" ||
        url.hostname === "wger.de",
      handler: new CacheFirst({
        cacheName: "demo-media",
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
