// Optional Supabase sync (spec Phase 4). Pure helpers: which rows to push, whether a pulled row
// wins (last write wins on updatedAt; soft deletes are ordinary updates), and auth-callback parsing.

/** Tables that sync. `kv` (timer state, swaps, drafts) stays on the device. */
export const SYNC_TABLES = [
  "fasts",
  "intake",
  "favorites",
  "workoutLogs",
  "progression",
  "bodyMetrics",
  "readiness",
  "insights",
  "episodeNotes",
  "settings",
] as const;

export type SyncTable = (typeof SYNC_TABLES)[number];

export interface Syncable {
  id: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface RemoteRow {
  tbl: string;
  id: string;
  data: Syncable;
  updated_at: string;
  deleted_at?: string | null;
  synced_at?: string;
}

export function toRemote(tbl: SyncTable, row: Syncable): RemoteRow {
  return { tbl, id: row.id, data: row, updated_at: row.updatedAt, deleted_at: row.deletedAt ?? null };
}

/** Rows changed on this device since the last push. */
export function changedSince<T extends Syncable>(rows: T[], sinceIso: string | null): T[] {
  if (!sinceIso) return rows;
  return rows.filter((r) => r.updatedAt > sinceIso);
}

/** Last write wins: apply the remote copy when there's no local one or it is strictly newer. */
export function remoteWins(local: Syncable | undefined, remote: Syncable): boolean {
  if (!local) return true;
  return Date.parse(remote.updatedAt) > Date.parse(local.updatedAt);
}

/** The newest synced_at seen, minus a small overlap so commits that land late are not missed. */
export function nextCursor(prev: string | null, rows: Pick<RemoteRow, "synced_at">[], overlapMs = 5_000): string | null {
  const latest = rows.reduce<string | null>((m, r) => (r.synced_at && (!m || r.synced_at > m) ? r.synced_at : m), null);
  if (!latest) return prev;
  return new Date(Date.parse(latest) - overlapMs).toISOString();
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  email?: string;
}

/** `#access_token=…&refresh_token=…&expires_in=3600` from a magic-link redirect. */
export function parseAuthHash(hash: string, now: number): AuthSession | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const accessToken = p.get("access_token");
  const refreshToken = p.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  const expiresIn = Number(p.get("expires_in") ?? "3600");
  return { accessToken, refreshToken, expiresAt: now + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000 };
}

export function authError(hash: string): string | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  return p.get("error_description") ?? p.get("error");
}

export function syncConfigured(url: string | undefined, key: string | undefined): boolean {
  return !!url && !!key && /^https:\/\//.test(url);
}
