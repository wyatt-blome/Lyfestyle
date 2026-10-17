import { describe, expect, it } from "vitest";
import { changedSince, nextCursor, parseAuthHash, remoteWins, syncConfigured, toRemote } from "./sync";

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
