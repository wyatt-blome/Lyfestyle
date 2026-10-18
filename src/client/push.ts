"use client";
// Background reminders via web push (docs/PUSH.md). The device works out its own reminder times
// and hands them, with its push subscription, to /api/push/subscribe; a cron-driven dispatcher
// sends them when due. In-app reminders (reminders.tsx) keep working whether or not this is on.
import { useEffect, useState } from "react";
import { windowHoursFor, windowSuperseded } from "@/lib/fasting";
import { HOUR_MS, MIN_MS } from "@/lib/time";
import type { Fast, Settings } from "@/lib/types";
import { useActiveFast, useFasts } from "./fasts";
import { useSettings } from "./settings";

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

export const PUSH_NOT_SET_UP = "Push isn't set up";
const SYNC_KEY = "push:lastSchedule";
const CHANGE_EVENT = "fm:push-change";
const MAX_AHEAD_MS = 7 * 24 * HOUR_MS;

// ---------- Environment ----------

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    typeof ServiceWorkerRegistration !== "undefined" &&
    "showNotification" in ServiceWorkerRegistration.prototype
  );
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) return reg;
  // First load: wait briefly for the worker (it is disabled in `next dev`).
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<undefined>((r) => setTimeout(() => r(undefined), 5000)),
  ]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await registration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  // iOS only offers push to Home Screen apps (16.4+); in a Safari tab PushManager is missing.
  if (isIos() && !isStandalone()) return "needs-install";
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription().catch(() => null)) ? "on" : "off";
}

// ---------- Server config ----------

export type PushConfig = { ok: true; publicKey: string } | { ok: false; error: string };
let configPromise: Promise<PushConfig> | null = null;

/** Whether the server has push set up, and its VAPID public key. Cached once it answers. */
export function pushConfig(): Promise<PushConfig> {
  // Without the public key in the build, push can't be set up: skip the request (and its 503).
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return Promise.resolve({ ok: false, error: PUSH_NOT_SET_UP });
  configPromise ??= fetch("/api/push/vapid", { cache: "no-store" })
    .then(async (res): Promise<PushConfig> => {
      const b = (await res.json().catch(() => null)) as { publicKey?: string; error?: string } | null;
      if (res.ok && b?.publicKey) return { ok: true, publicKey: b.publicKey };
      return { ok: false, error: b?.error ?? PUSH_NOT_SET_UP };
    })
    .catch((): PushConfig => {
      configPromise = null; // offline: ask again next time
      return { ok: false, error: "Can't reach the server. Check your connection." };
    });
  return configPromise;
}

function b64uToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

function subJson(sub: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } {
  const j = sub.toJSON();
  return { endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh ?? "", auth: j.keys?.auth ?? "" } };
}

function changed(): void {
  store(null);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// ---------- Enable / disable / test ----------

export type PushResult = { ok: true } | { ok: false; error: string };

/** Call from a tap: asks for notification permission, then subscribes this device. */
export async function enablePush(): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, error: "This browser can't do background reminders." };
  // Ask first, while the tap still counts as a user gesture (iOS requires it).
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, error: "Notifications are blocked. Allow them in the system settings." };
  const cfg = await pushConfig();
  if (!cfg.ok) return cfg;
  const reg = await registration();
  if (!reg) return { ok: false, error: "The app isn't installed yet. Reload and try again." };
  try {
    const key = b64uToBytes(cfg.publicKey);
    const existing = await reg.pushManager.getSubscription();
    if (existing && !sameKey(existing.options.applicationServerKey, key)) await existing.unsubscribe();
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  } catch {
    return { ok: false, error: "Couldn't turn on background reminders." };
  }
  changed();
  return { ok: true };
}

export async function disablePush(): Promise<PushResult> {
  try {
    const sub = await currentSubscription();
    if (sub) {
      const { endpoint } = sub;
      await sub.unsubscribe();
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      }).catch(() => undefined);
    }
  } catch {
    return { ok: false, error: "Couldn't turn off background reminders." };
  }
  changed();
  return { ok: true };
}

export async function sendTestPush(): Promise<PushResult> {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return { ok: false, error: "Background reminders are off on this device." };
  try {
    const res = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: subJson(sub) }),
    });
    if (res.ok) return { ok: true };
    const b = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: b?.error ?? `Test failed (${res.status}).` };
  } catch {
    return { ok: false, error: "Can't reach the server. Check your connection." };
  }
}

// ---------- Schedule ----------

export interface ReminderJob {
  fastId: string;
  kind: "halfway" | "target" | "window";
  sendAt: string;
  title: string;
  body: string;
}

/**
 * The push reminders still to come for these fasts: halfway and target for a running fast, and
 * "eating window closes in 30 min" (end + window − 30 min) for an ended one unless a later fast
 * has already started, each only if its toggle is on. Same wording as the in-app reminders.
 */
export function reminderJobs(fasts: (Fast | null | undefined)[], settings: Settings, now = Date.now()): ReminderJob[] {
  const n = settings.notifications;
  const out: ReminderJob[] = [];
  const add = (f: Fast, kind: ReminderJob["kind"], at: number, body: string) => {
    if (at > now && at <= now + MAX_AHEAD_MS) out.push({ fastId: f.id, kind, sendAt: new Date(at).toISOString(), title: "Fast & Move", body });
  };
  const seen = new Set<string>();
  for (const f of fasts) {
    if (!f || f.deletedAt || seen.has(f.id)) continue;
    seen.add(f.id);
    const start = Date.parse(f.startAt);
    const target = f.targetHours * HOUR_MS;
    if (f.status === "active" && !f.endAt) {
      if (n.halfway) add(f, "halfway", start + target / 2, `Halfway through your ${f.protocol} fast.`);
      if (n.target) add(f, "target", start + target, `Target reached: ${f.targetHours} h.`);
    } else if (f.endAt && n.windowClosing && !windowSuperseded(f, fasts)) {
      const w = windowHoursFor(f);
      if (w) add(f, "window", Date.parse(f.endAt) + w * HOUR_MS - 30 * MIN_MS, "Eating window closes in 30 min.");
    }
  }
  return out.slice(0, 10);
}

function read(): string | null {
  try {
    return localStorage.getItem(SYNC_KEY);
  } catch {
    return null;
  }
}

function store(v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(SYNC_KEY);
    else localStorage.setItem(SYNC_KEY, v);
  } catch {
    // Private mode: we just re-post next time.
  }
}

export type SyncOutcome = "off" | "not-set-up" | "unchanged" | "synced" | "failed";

/**
 * Sends this device's whole upcoming schedule (replacing what the server had for it). No-op when
 * push is off on this device, the server isn't set up, or the schedule hasn't changed.
 */
export async function syncFastReminders(fasts: (Fast | null | undefined)[], settings: Settings): Promise<SyncOutcome> {
  if (!pushSupported() || Notification.permission !== "granted") return "off";
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return "off";
  const cfg = await pushConfig();
  if (!cfg.ok) return "not-set-up";
  const jobs = reminderJobs(fasts, settings);
  const subscription = subJson(sub);
  const hash = JSON.stringify([subscription.endpoint, jobs.map((j) => [j.fastId, j.kind, j.sendAt])]);
  if (read() === hash) return "unchanged";
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription, jobs }),
    });
    if (!res.ok) return "failed";
    store(hash);
    return "synced";
  } catch {
    return "failed";
  }
}

/** Keeps the server's schedule in step with the running fast and the latest ended one. */
export function useFastPushSync(): void {
  const active = useActiveFast();
  const fasts = useFasts();
  const settings = useSettings();
  const [bump, setBump] = useState(0);

  useEffect(() => {
    const on = () => setBump((b) => b + 1);
    window.addEventListener(CHANGE_EVENT, on);
    return () => window.removeEventListener(CHANGE_EVENT, on);
  }, []);

  const lastEnded = fasts?.find((f) => f.endAt && f.status !== "active");

  useEffect(() => {
    if (active === undefined || fasts === undefined || !settings) return;
    // Debounced: editing a fast or toggling settings can write several times in a row.
    const t = setTimeout(() => void syncFastReminders([active, lastEnded], settings).catch(() => undefined), 1500);
    return () => clearTimeout(t);
  }, [active, fasts, lastEnded, settings, bump]);
}

/** Mount once (in Providers) to keep background reminders in sync. Renders nothing. */
export function PushSync(): null {
  useFastPushSync();
  return null;
}
