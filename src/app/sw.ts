/// <reference lib="webworker" />
// Service worker, bundled by Serwist at build time (src/app/serwist/[path]/route.ts).
// Precaches the app shell (every screen's HTML) and build files; runtime-caches the rest.
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Exercise demos (GIFs/images) from ExerciseDB and wger, kept for offline use.
    {
      matcher: ({ url }) => url.hostname === "static.exercisedb.dev" || url.hostname === "wger.de",
      handler: new CacheFirst({
        cacheName: "demo-media",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
