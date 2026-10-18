"use client";
// Optional Supabase sync over its REST API (no client library; DECISIONS D21). Off unless
// NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set and you sign in. The app
// never waits on it: every screen reads IndexedDB, and sync runs in the background.
import type { IndexableType } from "dexie";
import { useEffect, useSyncExternalStore } from "react";
import { db, type FastMoveDB } from "@/db/db";
import {
  changedSince,
  nextCursor,
  pageCursor,
  pendingSignInValid,
  PULL_PAGE,
  pullQuery,
  remoteWins,
  SYNC_TABLES,
  syncConfigured,
  toRemote,
  uniqueConflict,
  UNIQUE_KEYS,
  type AuthSession,
  type PageCursor,
  type RemoteRow,
  type Syncable,
  type SyncTable,
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
const S_PENDING = "fm.sync.pending";
const S_EMAIL = "fm.sync.email";

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
  // Only a link this device asked for (within the hour) is accepted on landing.
  write(S_PENDING, Date.now());
}

/** True once, if this device requested a magic link less than an hour ago. Clears the marker. */
export function takePendingSignIn(): boolean {
  const at = read<number>(S_PENDING);
  write(S_PENDING, null);
  return pendingSignInValid(at, Date.now());
}

/**
 * Bumped whenever the cursors are reset or the session changes, so a sync that was already
 * running can't write its now-stale cursors afterwards.
 */
let generation = 0;

function writeCursor(key: string, value: string | null, gen: number): void {
  if (gen === generation) write(key, value);
}

/** Forget where push and pull got to, so the next run sends everything and re-reads everything. */
export function resetSyncCursors(): void {
  generation++;
  write(S_PUSHED, null);
  write(S_PULLED, null);
}

export function saveSession(s: AuthSession): void {
  const prev = read<AuthSession>(S_SESSION);
  if (prev) {
    // Signing in over a session: it may be another account, and we only learn the email later.
    if (prev.email && !read(S_EMAIL)) write(S_EMAIL, prev.email);
    resetSyncCursors();
  }
  write(S_SESSION, s);
}

export function signOut(): void {
  const s = read<AuthSession>(S_SESSION);
  generation++;
  // Best effort: revoke this device's refresh token on the server too (scope=local, so other
  // devices stay signed in; Supabase's default would sign out everywhere).
  if (s && SYNC_AVAILABLE) void api("/auth/v1/logout?scope=local", { method: "POST" }, s.accessToken).catch(() => undefined);
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
    // Another account than last time: its server data has nothing to do with our cursors.
    const prevEmail = read<string>(S_EMAIL);
    if (u.email && prevEmail && prevEmail !== u.email) resetSyncCursors();
    if (u.email) write(S_EMAIL, u.email);
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
  const gen = generation;
  try {
    const d = db();
    const pushedAt = read<string>(S_PUSHED);
    let sent = 0;
    let pull: { received: number; failed: number };
    if (pushedAt) {
      sent = await push(d, s.accessToken, pushedAt, gen);
      pull = await pullAll(d, s.accessToken, gen);
    } else {
      // First run on this device (or after an import or wipe): pull first, so its fresh
      // defaults can't overwrite the real records from another device.
      pull = await pullAll(d, s.accessToken, gen);
      sent = await push(d, s.accessToken, null, gen);
    }
    const msg = `Sent ${sent}, received ${pull.received}${pull.failed ? `, ${pull.failed} couldn't be saved on this device` : ""}`;
    write(S_LAST, { at: new Date().toISOString(), ok: pull.failed === 0, message: msg });
  } catch (e) {
    const msg = e instanceof TypeError ? "No connection to Supabase." : (e as Error).message;
    write(S_LAST, { at: new Date().toISOString(), ok: false, message: msg });
  } finally {
    busy = false;
    emit();
  }
}

/** Push everything changed here since `since` (all rows when null). Returns how many were sent. */
async function push(d: FastMoveDB, token: string, since: string | null, gen: number): Promise<number> {
  const startedAt = new Date().toISOString();
  const out: RemoteRow[] = [];
  for (const t of SYNC_TABLES) {
    const rows = (await d.table(t).toArray()) as Syncable[];
    for (const r of changedSince(rows, since)) out.push(toRemote(t, r));
  }
  for (let i = 0; i < out.length; i += 500) {
    const res = await api(
      "/rest/v1/records?on_conflict=user_id,tbl,id",
      { method: "POST", body: JSON.stringify(out.slice(i, i + 500)), headers: { Prefer: "resolution=merge-duplicates,return=minimal" } },
      token,
    );
    if (!res.ok) throw new Error(await errorText(res));
  }
  writeCursor(S_PUSHED, startedAt, gen);
  return out.length;
}

/**
 * Pull everything the server accepted since the saved cursor; newer copies win. Pages continue
 * after the last row read (ties broken by tbl, id); the 5 s overlap only goes into the cursor
 * saved at the end. A row that can't be saved is counted and skipped, never aborting the run, and is retried next run.
 */
async function pullAll(d: FastMoveDB, token: string, gen: number): Promise<{ received: number; failed: number }> {
  const start = read<string>(S_PULLED);
  let page: PageCursor | null = null;
  let latest: string | null = null;
  let received = 0;
  let failed = 0;
  for (;;) {
    const res = await api(pullQuery(start, page), {}, token);
    if (!res.ok) throw new Error(await errorText(res));
    const rows = (await res.json()) as RemoteRow[];
    for (const r of rows) {
      if (r.synced_at && (!latest || r.synced_at > latest)) latest = r.synced_at;
      if (!(SYNC_TABLES as readonly string[]).includes(r.tbl)) continue;
      try {
        if (await applyRow(d, r.tbl as SyncTable, r.data)) received++;
      } catch {
        failed++;
      }
    }
    const next = pageCursor(rows);
    if (rows.length < PULL_PAGE || !next) break;
    page = next;
  }
  // If any row couldn't be saved here, keep the old cursor so the next run retries it (applying
  // the others again is harmless: last write wins).
  if (failed === 0) writeCursor(S_PULLED, nextCursor(start, latest ? [{ synced_at: latest }] : []), gen);
  return { received, failed };
}

/** Apply one pulled row in a single transaction, resolving unique-key clashes. True if saved. */
async function applyRow(d: FastMoveDB, tbl: SyncTable, remote: Syncable): Promise<boolean> {
  const table = d.table(tbl);
  const key = UNIQUE_KEYS[tbl];
  return d.transaction("rw", table, async () => {
    const local = (await table.get(remote.id)) as Syncable | undefined;
    if (!remoteWins(local, remote)) return false;
    const value = key ? (remote as unknown as Record<string, unknown>)[key] : undefined;
    if (key && value !== undefined && value !== null) {
      const others = (await table.where(key).equals(value as IndexableType).toArray()) as Syncable[];
      const conflicting = others.find((o) => o.id !== remote.id);
      const action = uniqueConflict(conflicting, remote);
      if (action === "skip") return false;
      if (action === "replace" && conflicting) await table.delete(conflicting.id);
    }
    await table.put(remote);
    return true;
  });
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
