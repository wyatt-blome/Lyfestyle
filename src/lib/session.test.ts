import { describe, expect, it } from "vitest";
import { sessions } from "@/seed/sessions";
import { withoutHeavyCarries, applySwaps, defaultEasy, deloadReasons, describeItem, fastTimingNote, hrMax, sessionBlocks, zones } from "./session";
import type { Fast } from "./types";

const T = (id: string) => sessions.find((s) => s.id === id)!;

describe("variants and deload", () => {
  it("uses the short-day blocks for Short Day", () => {
    const a = sessionBlocks(T("A"), "short", false);
    expect(a.map((b) => b.label)).toEqual(["McGill Big 3", "S&S"]);
  });

  it("scales sets and rounds to ~60% on a deload", () => {
    const a = sessionBlocks(T("A"), "full", true);
    const ss = a.find((b) => b.label === "S&S")!;
    expect(ss.items[0].sets).toBe(6);
    expect(a.find((b) => b.label === "Block 2")!.rounds).toBe(2);
  });

  it("applies swaps", () => {
    const b = applySwaps(sessionBlocks(T("A"), "full", false), { "kb-swing-2h": "kb-deadlift" });
    expect(b.flatMap((x) => x.items).some((i) => i.exerciseId === "kb-swing-2h")).toBe(false);
  });

  it("describes an item", () => {
    expect(describeItem({ exerciseId: "kb-row", reps: 8, perSide: true, loadLb: 40 }, 3, 60)).toBe("3 × 8/side · 40 lb · rest 60 s");
    expect(describeItem({ exerciseId: "deep-squat-hold", seconds: 120 })).toBe("2 min");
  });
});

describe("heart rate", () => {
  it("uses HRmax = 211 − 0.64 × age", () => {
    expect(hrMax(45)).toBe(182);
    const z = zones(45);
    expect(z.work).toEqual([155, 173]);
    expect(z.recovery).toBe(127);
  });
});

describe("deload triggers and easy days", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  const fast = (startH: number, endH?: number): Fast => ({
    id: "f",
    createdAt: "",
    updatedAt: "",
    protocol: "36h",
    targetHours: 36,
    startAt: new Date(now - startH * 3_600_000).toISOString(),
    endAt: endH === undefined ? undefined : new Date(now - endH * 3_600_000).toISOString(),
    status: endH === undefined ? "active" : "completed",
  });

  it("lists every reason", () => {
    expect(deloadReasons({ deloadWeek: true, readinessScore: 2, recentFasts: [fast(50, 10)], now, manual: true })).toHaveLength(4);
    expect(deloadReasons({ deloadWeek: false, readinessScore: 3, recentFasts: [fast(80, 60)], now })).toEqual([]);
  });

  it("defaults Easy Day to M, or Z on a Tuesday", () => {
    expect(defaultEasy("A")).toBe("M");
    expect(defaultEasy("M")).toBe("Z");
  });

  it("notes OMAD timing for hard sessions", () => {
    expect(fastTimingNote({ ...fast(5), protocol: "OMAD", targetHours: 23 }, true)).toMatch(/before the meal/);
    expect(fastTimingNote({ ...fast(5), protocol: "OMAD", targetHours: 23 }, false)).toBeNull();
  });
});

describe("long-fast and quick-20 shaping", () => {
  it("drops 40 lb carries during a long fast", () => {
    const z = withoutHeavyCarries(sessionBlocks(T("Z"), "full", false));
    expect(z.flatMap((b) => b.items).some((i) => i.exerciseId === "kb-suitcase-carry")).toBe(false);
    const m = withoutHeavyCarries(sessionBlocks(T("M"), "full", false));
    expect(m.flatMap((b) => b.items).some((i) => i.exerciseId === "kb-suitcase-march")).toBe(false);
    expect(m.flatMap((b) => b.items).some((i) => i.exerciseId === "cat-camel")).toBe(true);
  });
  it("does not shrink a Quick 20 on a deload", () => {
    expect(sessionBlocks(T("Q2"), "full", true)).toEqual(T("Q2").blocks);
  });
});
