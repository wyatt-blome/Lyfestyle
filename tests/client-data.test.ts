// Device-code checks against an in-memory IndexedDB: backup stamping, settings defaults, and the
// sync pull (unique-key clashes, paging through ties, pull-first on a fresh device).
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");

const { FastMoveDB, setDb, db } = await import("@/db/db");
const { exportAll, importAll, wipeAll } = await import("@/client/backup");
const { getSettings, saveSettings, SETTINGS_EPOCH } = await import("@/client/settings");
const sync = await import("@/client/sync");

let n = 0;
beforeEach(async () => {
  setDb(new FastMoveDB(`test-${++n}`));
  store.clear();
  vi.unstubAllGlobals();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe("backup", () => {
  it("records its own backup time in the exported settings", async () => {
    const before = Date.now();
    const { blob } = await exportAll();
    const file = JSON.parse(await blob.text());
    const s = file.tables.settings[0];
    expect(Date.parse(s.lastBackupAt)).toBeGreaterThanOrEqual(before);
    expect(s.lastBackupAt).toBe(file.exportedAt);
    expect((await getSettings()).lastBackupAt).toBe(file.exportedAt);
  });

  it("resets the sync cursors on import and wipe", async () => {
    store.set("fm.sync.pushedAt", JSON.stringify("2026-10-01T00:00:00Z"));
    store.set("fm.sync.pulledAt", JSON.stringify("2026-10-01T00:00:00Z"));
    const { blob } = await exportAll();
    await importAll(await blob.text());
    expect(store.has("fm.sync.pushedAt")).toBe(false);
    expect(store.has("fm.sync.pulledAt")).toBe(false);
    store.set("fm.sync.pulledAt", JSON.stringify("x"));
    await wipeAll();
    expect(store.has("fm.sync.pulledAt")).toBe(false);
  });
});

describe("settings", () => {
  it("stamps untouched defaults with the epoch, real saves with now", async () => {
    expect((await getSettings()).updatedAt).toBe(SETTINGS_EPOCH);
    await saveSettings({ onboarded: true });
    expect(Date.parse((await getSettings()).updatedAt)).toBeGreaterThan(Date.parse("2020-01-01"));
  });

  it("onboarding and time-zone writes keep the stored timestamp, so sync from another phone wins", async () => {
    await db().settings.clear();
    await saveSettings({ onboarded: true, age: 50 }, { touch: false });
    await saveSettings({ tz: "America/New_York" }, { touch: false });
    const s = await getSettings();
    expect(s.updatedAt).toBe(SETTINGS_EPOCH);
    expect(s.age).toBe(50);
  });
});

describe("sync pull", () => {
  type Row = { tbl: string; id: string; data: Record<string, unknown>; updated_at: string; synced_at: string };

  function server(rows: Row[], pageLimit = 1000) {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") return new Response(null, { status: 201 });
      const u = new URL(url);
      const or = u.searchParams.get("or");
      const gt = u.searchParams.get("synced_at");
      let out = [...rows].sort((a, b) =>
        a.synced_at.localeCompare(b.synced_at) || a.tbl.localeCompare(b.tbl) || a.id.localeCompare(b.id),
      );
      if (gt) out = out.filter((r) => r.synced_at > gt.replace(/^gt\./, ""));
      if (or) {
        const at = /synced_at\.gt\."([^"]+)"/.exec(or)![1];
        const tbl = /tbl\.eq\."([^"]+)"/.exec(or)![1];
        const id = /id\.gt\."([^"]+)"/.exec(or)![1];
        out = out.filter(
          (r) => r.synced_at > at || (r.synced_at === at && (r.tbl > tbl || (r.tbl === tbl && r.id > id))),
        );
      }
      return new Response(JSON.stringify(out.slice(0, Math.min(pageLimit, Number(u.searchParams.get("limit"))))), {
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    store.set(
      "fm.sync.session",
      JSON.stringify({ accessToken: "t", refreshToken: "r", expiresAt: Date.now() + 3_600_000 }),
    );
    return calls;
  }

  const readiness = (id: string, updatedAt: string, extra: object = {}) => ({
    id,
    createdAt: updatedAt,
    updatedAt,
    date: "2026-10-16",
    sleep: 3,
    soreness: 3,
    energy: 3,
    ...extra,
  });

  it("resolves a unique-key clash instead of wedging", async () => {
    await db().readiness.put(readiness("local", "2026-10-16T08:00:00Z"));
    await db().progression.put({ id: "p-local", exerciseId: "swing", updatedAt: "2026-10-16T09:00:00Z" } as never);
    server([
      { tbl: "readiness", id: "remote", data: readiness("remote", "2026-10-16T09:00:00Z", { sleep: 5 }), updated_at: "", synced_at: "2026-10-16T10:00:00Z" },
      { tbl: "progression", id: "p-remote", data: { id: "p-remote", exerciseId: "swing", updatedAt: "2026-10-16T08:00:00Z" }, updated_at: "", synced_at: "2026-10-16T10:00:01Z" },
    ]);
    await sync.syncNow();
    const r = await db().readiness.toArray();
    expect(r.map((x) => [x.id, x.sleep])).toEqual([["remote", 5]]);
    // The older remote progression is skipped; the local one stays.
    expect((await db().progression.toArray()).map((x) => x.id)).toEqual(["p-local"]);
    const last = JSON.parse(store.get("fm.sync.last")!);
    expect(last.ok).toBe(true);
  });

  it("pages through more rows than a page holds when they share a synced_at", async () => {
    const at = "2026-10-16T10:00:00.123456+00:00";
    const rows: Row[] = Array.from({ length: 2500 }, (_, i) => {
      const id = `i${String(i).padStart(5, "0")}`;
      return { tbl: "intake", id, data: { id, updatedAt: "2026-10-16T09:00:00Z", at: "2026-10-16T09:00:00Z", tags: [] }, updated_at: "", synced_at: at };
    });
    const calls = server(rows);
    await sync.syncNow();
    expect(await db().intake.count()).toBe(2500);
    expect(calls.filter((c) => c.startsWith("GET")).length).toBe(3);
    // The saved cursor carries the 5 s overlap.
    expect(JSON.parse(store.get("fm.sync.pulledAt")!)).toBe("2026-10-16T09:59:55.123Z");
  });

  it("pulls before pushing on a device's first sync", async () => {
    await getSettings(); // fresh defaults, stamped with the epoch
    const calls = server([
      { tbl: "settings", id: "settings", data: { id: "settings", age: 52, updatedAt: "2026-10-01T00:00:00Z" }, updated_at: "", synced_at: "2026-10-01T00:00:01Z" },
    ]);
    await sync.syncNow();
    expect(calls[0]).toMatch(/^GET /);
    expect((await getSettings()).age).toBe(52);
    // Later runs push first.
    await saveSettings({ age: 53 });
    calls.length = 0;
    await sync.syncNow();
    expect(calls[0]).toMatch(/^POST /);
    expect(calls[1]).toMatch(/^GET .*synced_at=gt/);
  });

  it("counts a row that can't be saved and carries on", async () => {
    server([
      { tbl: "fasts", id: "bad", data: { updatedAt: "2026-10-16T09:00:00Z" } as never, updated_at: "", synced_at: "2026-10-16T10:00:00Z" },
      { tbl: "fasts", id: "good", data: { id: "good", startAt: "2026-10-16T00:00:00Z", status: "active", updatedAt: "2026-10-16T09:00:00Z" }, updated_at: "", synced_at: "2026-10-16T10:00:01Z" },
    ]);
    await sync.syncNow();
    expect((await db().fasts.toArray()).map((f) => f.id)).toEqual(["good"]);
    const last = JSON.parse(store.get("fm.sync.last")!);
    expect(last.ok).toBe(false);
    expect(last.message).toMatch(/received 1, 1 couldn't be saved/);
    // The cursor stays put so the failed row is retried next run.
    expect(store.get("fm.sync.pulledAt") ?? null).toBeNull();
  });
});
