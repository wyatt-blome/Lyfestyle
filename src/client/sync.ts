"use client";
// Optional Supabase sync over its REST API (no client library; DECISIONS D21). Off unless
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set and you sign in. The app
// never waits on it: every screen reads IndexedDB, and sync runs in the background.
import { useEffect, useSyncExternalStore } from "react";
import { db } from "@/db/db";
import {
  changedSince,
  nextCursor,
  remoteWins,
  SYNC_TABLES,
  syncConfigured,
  toRemote,
  type AuthSession,
  type RemoteRow,
  type Syncable,
} from "@/lib/sync";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SYNC_AVAILABLE = syncConfigured(URL_, KEY);

// Sync state lives in localStorage, not IndexedDB, so it never ends up in a backup file and a
// restored backup can't carry another device's cursors.
const S_SESSION = "fm.sync.session";
const S_PUSHED = "fm.sync.pushedAt";
const S_PULLED = "fm.sync.pulledAt";
const S_LAST = "fm.sync.last";

function read<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

function write(k: string, v: unknown): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Private mode: sync just won't remember its place.
  }
  emit();
}

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}

export interface SyncStatus {
  signedIn: boolean;
  email?: string;
  last?: { at: string; ok: boolean; message: string };
  busy: boolean;
}

let busy = false;
let snapshot: SyncStatus | null = null;
function computeStatus(): SyncStatus {
  const s = read<AuthSession>(S_SESSION);
  return { signedIn: !!s, email: s?.email, last: read(S_LAST) ?? undefined, busy };
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => {
      const next = computeStatus();
      if (!snapshot || JSON.stringify(snapshot) !== JSON.stringify(next)) snapshot = next;
      return snapshot;
    },
    () => ({ signedIn: false, busy: false }),
  );
}

async function api(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const res = await fetch(`${URL_}${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  return res;
}

export async function sendMagicLink(email: string): Promise<void> {
  const redirect = `${window.location.origin}/settings`;
  const res = await api(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, {
    method: "POST",
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!res.ok) throw new Error(await errorText(res));
}

export function saveSession(s: AuthSession): void {
  write(S_SESSION, s);
}

export function signOut(): void {
  write(S_SESSION, null);
  write(S_PUSHED, null);
  write(S_PULLED, null);
  write(S_LAST, null);
}

async function errorText(res: Response): Promise<string> {
  if (res.status === 0 || res.status >= 500) {
    return "Supabase didn't answer. Free projects pause after a week idle: open the Supabase dashboard to restore it.";
  }
  try {
    const j = (await res.json()) as { msg?: string; message?: string; error_description?: string };
    return j.msg ?? j.message ?? j.error_description ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

async function validSession(): Promise<AuthSession | null> {
  const s = read<AuthSession>(S_SESSION);
  if (!s) return null;
  if (s.expiresAt - Date.now() > 60_000) return s;
  const res = await api("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: s.refreshToken }),
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) signOut();
    throw new Error(await errorText(res));
  }
  const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number; user?: { email?: string } };
  const next: AuthSession = {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: Date.now() + j.expires_in * 1000,
    email: j.user?.email ?? s.email,
  };
  write(S_SESSION, next);
  return next;
}

export async function fetchEmail(): Promise<void> {
  const s = await validSession();
  if (!s) return;
  const res = await api("/auth/v1/user", {}, s.accessToken);
  if (res.ok) {
    const u = (await res.json()) as { email?: string };
    write(S_SESSION, { ...s, email: u.email });
  }
}

/** One push-then-pull round. Safe to call often; concurrent calls share one run. */
let running: Promise<void> | null = null;
export function syncNow(): Promise<void> {
  if (!SYNC_AVAILABLE) return Promise.resolve();
  running ??= runSync().finally(() => {
    running = null;
  });
  return running;
}

async function runSync(): Promise<void> {
  const s = await validSession().catch((e: Error) => {
    write(S_LAST, { at: new Date().toISOString(), ok: false, message: e.message });
    return null;
  });
  if (!s) return;
  busy = true;
  emit();
  const startedAt = new Date().toISOString();
  try {
    const d = db();
    // Push everything changed here since the last successful push.
    const pushedAt = read<string>(S_PUSHED);
    const out: RemoteRow[] = [];
    for (const t of SYNC_TABLES) {
      const rows = (await d.table(t).toArray()) as Syncable[];
      for (const r of changedSince(rows, pushedAt)) out.push(toRemote(t, r));
    }
    for (let i = 0; i < out.length; i += 500) {
      const res = await api(
        "/rest/v1/records?on_conflict=user_id,tbl,id",
        { method: "POST", body: JSON.stringify(out.slice(i, i + 500)), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } },
        s.accessToken,
      );
      if (!res.ok) throw new Error(await errorText(res));
    }
    write(S_PUSHED, startedAt);

    // Pull everything the server accepted since the last pull; newer copies win.
    let cursor = read<string>(S_PULLED);
    let pulled = 0;
    for (;;) {
      const q = `/rest/v1/records?select=tbl,id,data,updated_at,synced_at&order=synced_at.asc&limit=1000${cursor ? `&synced_at=gt.${encodeURIComponent(cursor)}` : ""}`;
      const res = await api(q, {}, s.accessToken);
      if (!res.ok) throw new Error(await errorText(res));
      const rows = (await res.json()) as RemoteRow[];
      for (const r of rows) {
        if (!(SYNC_TABLES as readonly string[]).includes(r.tbl)) continue;
        const table = d.table(r.tbl);
        const local = (await table.get(r.id)) as Syncable | undefined;
        if (remoteWins(local, r.data)) {
          await table.put(r.data);
          pulled++;
        }
      }
      const next = nextCursor(cursor, rows);
      if (rows.length < 1000 || next === cursor) {
        cursor = next;
        break;
      }
      cursor = next;
    }
    write(S_PULLED, cursor);
    write(S_LAST, { at: new Date().toISOString(), ok: true, message: `Sent ${out.length}, received ${pulled}` });
  } catch (e) {
    const msg = e instanceof TypeError ? "No connection to Supabase." : (e as Error).message;
    write(S_LAST, { at: new Date().toISOString(), ok: false, message: msg });
  } finally {
    busy = false;
    emit();
  }
}

/** Mounted once: syncs on start, when the app returns to the foreground, and every 5 minutes. */
export function SyncRunner(): null {
  useEffect(() => {
    if (!SYNC_AVAILABLE) return;
    const go = () => {
      if (navigator.onLine && document.visibilityState === "visible") void syncNow();
    };
    go();
    const id = window.setInterval(go, 5 * 60_000);
    document.addEventListener("visibilitychange", go);
    window.addEventListener("online", go);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", go);
      window.removeEventListener("online", go);
    };
  }, []);
  return null;
}
