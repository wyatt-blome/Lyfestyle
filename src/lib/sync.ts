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

/**
 * Secondary keys that are unique on the device (`&` indexes in src/db/db.ts). Two devices can
 * create the same day's readiness (or the same exercise's progression) under different ids, and
 * putting the second one would throw ConstraintError.
 */
export const UNIQUE_KEYS: Partial<Record<SyncTable, string>> = {
  readiness: "date",
  progression: "exerciseId",
  episodeNotes: "episodeId",
};

export type ConflictAction = "put" | "replace" | "skip";

/**
 * What to do with a pulled row given the local row (another id) holding the same unique key:
 * "put" when there is none, "replace" (delete the local row, then put) when the remote copy wins,
 * "skip" otherwise. Last write wins, except a tombstone never evicts a live row and a live row
 * always beats a tombstone, since they are different records that happen to share the key.
 */
export function uniqueConflict(conflicting: Syncable | undefined, remote: Syncable): ConflictAction {
  if (!conflicting || conflicting.id === remote.id) return "put";
  if (remote.deletedAt && !conflicting.deletedAt) return "skip";
  if (!remote.deletedAt && conflicting.deletedAt) return "replace";
  return remoteWins(conflicting, remote) ? "replace" : "skip";
}

/** Position inside one pull: the last row read, in (synced_at, tbl, id) order. */
export interface PageCursor {
  at: string;
  tbl: string;
  id: string;
}

export const PULL_PAGE = 1000;

/**
 * The PostgREST query for one page of the pull. The first page starts after the saved cursor
 * (which already includes the overlap); later pages continue strictly after the last row read,
 * with tbl and id breaking ties, so a thousand rows sharing a synced_at can't repeat a page.
 */
export function pullQuery(start: string | null, page: PageCursor | null, limit = PULL_PAGE): string {
  const q = (v: string) => encodeURIComponent(`"${v}"`);
  let filter = "";
  if (page) {
    const at = q(page.at);
    filter = `&or=(synced_at.gt.${at},and(synced_at.eq.${at},tbl.gt.${q(page.tbl)}),and(synced_at.eq.${at},tbl.eq.${q(page.tbl)},id.gt.${q(page.id)}))`;
  } else if (start) {
    filter = `&synced_at=gt.${encodeURIComponent(start)}`;
  }
  return `/rest/v1/records?select=tbl,id,data,updated_at,synced_at&order=synced_at.asc,tbl.asc,id.asc&limit=${limit}${filter}`;
}

/** The cursor after a page: its last row, or null if the page is empty. */
export function pageCursor(rows: Pick<RemoteRow, "synced_at" | "tbl" | "id">[]): PageCursor | null {
  const last = rows[rows.length - 1];
  return last?.synced_at ? { at: last.synced_at, tbl: last.tbl, id: last.id } : null;
}

/** A magic-link sign-in is only accepted for an hour after this device asked for one. */
export const PENDING_SIGNIN_MS = 60 * 60_000;

export function pendingSignInValid(requestedAt: number | null, now: number): boolean {
  return typeof requestedAt === "number" && now >= requestedAt && now - requestedAt < PENDING_SIGNIN_MS;
}

/**
 * The newest synced_at seen, minus a small overlap so commits that land late are not missed.
 * Applied once per run (to the cursor saved at the end), never between pages.
 */
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
