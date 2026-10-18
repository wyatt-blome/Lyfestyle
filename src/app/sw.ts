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
    // Food lookups and push go to the network, and so does Supabase (sync, sign-in): personal
    // data and tokens never sit in a cache.
    { matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    { matcher: ({ url }) => url.hostname.endsWith(".supabase.co") || url.hostname.endsWith(".supabase.in"), handler: new NetworkOnly() },
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
          // Opaque copies count heavily against storage quota: drop them first if space runs out.
          new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true }),
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

// Background reminders (web push, docs/PUSH.md). Payload: JSON {title, body, tag, url}.
self.addEventListener("push", (event) => {
  let data: { title?: string; body?: string; tag?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Fast & Move", {
      body: data.body ?? "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/fast" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data as { url?: string } | null)?.url || "/fast";
  const url = new URL(raw, self.location.origin);
  const target = url.origin === self.location.origin ? url.href : new URL("/fast", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if (open.url !== target && typeof open.navigate === "function") await open.navigate(target).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
