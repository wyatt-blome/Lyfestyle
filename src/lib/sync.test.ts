import { describe, expect, it } from "vitest";
import {
  changedSince,
  nextCursor,
  pageCursor,
  parseAuthHash,
  pendingSignInValid,
  pullQuery,
  remoteWins,
  syncConfigured,
  toRemote,
  uniqueConflict,
  UNIQUE_KEYS,
} from "./sync";

const row = (updatedAt: string, extra: object = {}) => ({ id: "a", updatedAt, ...extra });

describe("last write wins", () => {
  it("applies a strictly newer remote row", () => {
    expect(remoteWins(undefined, row("2026-10-01T00:00:00Z"))).toBe(true);
    expect(remoteWins(row("2026-10-01T00:00:00Z"), row("2026-10-01T00:00:01Z"))).toBe(true);
    expect(remoteWins(row("2026-10-01T00:00:01Z"), row("2026-10-01T00:00:00Z"))).toBe(false);
    // Ties keep the local copy.
    expect(remoteWins(row("2026-10-01T00:00:00Z"), row("2026-10-01T00:00:00Z"))).toBe(false);
  });

  it("treats soft deletes as ordinary newer writes", () => {
    const deleted = row("2026-10-02T00:00:00Z", { deletedAt: "2026-10-02T00:00:00Z" });
    expect(remoteWins(row("2026-10-01T00:00:00Z"), deleted)).toBe(true);
    expect(toRemote("fasts", deleted).deleted_at).toBe("2026-10-02T00:00:00Z");
  });
});

describe("unique-key clashes on pull", () => {
  const remote = { id: "r", updatedAt: "2026-10-02T00:00:00Z" };

  it("knows the device's unique indexes", () => {
    expect(UNIQUE_KEYS).toEqual({ readiness: "date", progression: "exerciseId", episodeNotes: "episodeId" });
  });

  it("puts when nothing else holds the key", () => {
    expect(uniqueConflict(undefined, remote)).toBe("put");
    expect(uniqueConflict({ ...remote }, remote)).toBe("put");
  });

  it("replaces an older local row, skips for a newer one", () => {
    expect(uniqueConflict({ id: "l", updatedAt: "2026-10-01T00:00:00Z" }, remote)).toBe("replace");
    expect(uniqueConflict({ id: "l", updatedAt: "2026-10-03T00:00:00Z" }, remote)).toBe("skip");
    expect(uniqueConflict({ id: "l", updatedAt: remote.updatedAt }, remote)).toBe("skip");
  });

  it("never lets a tombstone evict a live row", () => {
    const dead = { ...remote, deletedAt: remote.updatedAt };
    expect(uniqueConflict({ id: "l", updatedAt: "2026-10-01T00:00:00Z" }, dead)).toBe("skip");
    expect(uniqueConflict({ id: "l", updatedAt: "2026-10-03T00:00:00Z", deletedAt: "2026-10-03T00:00:00Z" }, remote)).toBe(
      "replace",
    );
  });
});

describe("pull paging", () => {
  it("starts after the saved cursor, then continues after the last row with tie-breaks", () => {
    expect(pullQuery(null, null, 2)).toBe(
      "/rest/v1/records?select=tbl,id,data,updated_at,synced_at&order=synced_at.asc,tbl.asc,id.asc&limit=2",
    );
    expect(pullQuery("2026-10-01T00:00:00.000Z", null)).toContain("&synced_at=gt.2026-10-01T00%3A00%3A00.000Z");
    const rows = [
      { tbl: "fasts", id: "a", synced_at: "2026-10-01T00:00:00.5+00:00" },
      { tbl: "intake", id: "b", synced_at: "2026-10-01T00:00:00.5+00:00" },
    ];
    const page = pageCursor(rows);
    expect(page).toEqual({ at: "2026-10-01T00:00:00.5+00:00", tbl: "intake", id: "b" });
    const q = decodeURIComponent(pullQuery("ignored", page));
    expect(q).toContain(
      '&or=(synced_at.gt."2026-10-01T00:00:00.5+00:00",and(synced_at.eq."2026-10-01T00:00:00.5+00:00",tbl.gt."intake"),and(synced_at.eq."2026-10-01T00:00:00.5+00:00",tbl.eq."intake",id.gt."b"))',
    );
    // The + in the zone offset is percent-encoded, not sent as a space.
    expect(pullQuery(null, page)).toContain("%2B00%3A00");
    expect(pageCursor([])).toBeNull();
  });
});

describe("magic-link guard", () => {
  it("accepts a sign-in only within an hour of asking", () => {
    const t = Date.parse("2026-10-01T00:00:00Z");
    expect(pendingSignInValid(null, t)).toBe(false);
    expect(pendingSignInValid(t, t + 10 * 60_000)).toBe(true);
    expect(pendingSignInValid(t, t + 61 * 60_000)).toBe(false);
    expect(pendingSignInValid(t + 60_000, t)).toBe(false);
  });
});

describe("push and pull bookkeeping", () => {
  it("pushes only rows changed since the last push", () => {
    const rows = [row("2026-10-01T00:00:00Z"), { ...row("2026-10-03T00:00:00Z"), id: "b" }];
    expect(changedSince(rows, "2026-10-02T00:00:00Z").map((r) => r.id)).toEqual(["b"]);
    expect(changedSince(rows, null)).toHaveLength(2);
  });

  it("moves the pull cursor to the newest synced_at with an overlap", () => {
    const c = nextCursor(null, [{ synced_at: "2026-10-01T00:00:10.000Z" }, { synced_at: "2026-10-01T00:00:20.000Z" }]);
    expect(c).toBe("2026-10-01T00:00:15.000Z");
    expect(nextCursor("2026-10-01T00:00:00.000Z", [])).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("auth", () => {
  it("parses the magic-link redirect", () => {
    const s = parseAuthHash("#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=magiclink", 1000);
    expect(s).toEqual({ accessToken: "abc", refreshToken: "def", expiresAt: 3_601_000 });
    expect(parseAuthHash("#error=access_denied", 0)).toBeNull();
  });

  it("is off unless both settings are present", () => {
    expect(syncConfigured(undefined, "k")).toBe(false);
    expect(syncConfigured("https://x.supabase.co", "k")).toBe(true);
  });
});
