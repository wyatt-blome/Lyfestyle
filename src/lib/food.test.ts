import { describe, expect, it } from "vitest";
import type { Fast, IntakeEntry } from "./types";
import {
  copyDayPlan,
  dayBounds,
  daySegments,
  fastingIntervals,
  favoriteLabel,
  fractionOfDay,
  localMinutes,
  mergeIntervals,
  segmentHours,
  templateOf,
  zonedInstant,
} from "./food";
import { HOUR_MS } from "./time";

const TZ = "America/Denver";

function fast(p: Partial<Fast> & { startAt: string }): Fast {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    createdAt: p.startAt,
    updatedAt: p.startAt,
    protocol: "16:8",
    targetHours: 16,
    status: p.endAt ? "completed" : "active",
    ...p,
  };
}

function entry(p: Partial<IntakeEntry> & { at: string; name: string }): IntakeEntry {
  return {
    id: Math.random().toString(36).slice(2),
    createdAt: p.at,
    updatedAt: p.at,
    kind: "meal",
    breaksFast: true,
    tags: [],
    ...p,
  };
}

describe("local day bounds", () => {
  it("finds midnight in the zone", () => {
    const d = dayBounds("2026-10-17", TZ);
    expect(new Date(d.start).toISOString()).toBe("2026-10-17T06:00:00.000Z");
    expect(d.end - d.start).toBe(24 * HOUR_MS);
  });

  it("handles DST days (25 h in November, 23 h in March)", () => {
    const fall = dayBounds("2026-11-01", TZ);
    expect(fall.end - fall.start).toBe(25 * HOUR_MS);
    const spring = dayBounds("2026-03-08", TZ);
    expect(spring.end - spring.start).toBe(23 * HOUR_MS);
  });

  it("round-trips clock minutes", () => {
    const t = zonedInstant("2026-10-17", 7 * 60 + 30, TZ);
    expect(new Date(t).toISOString()).toBe("2026-10-17T13:30:00.000Z");
    expect(localMinutes(t, TZ)).toBe(450);
  });
});

describe("fasting vs eating", () => {
  const day = dayBounds("2026-10-17", TZ); // 06:00Z → next 06:00Z
  const now = day.end + HOUR_MS;

  it("merges overlapping intervals", () => {
    expect(mergeIntervals([{ start: 5, end: 9 }, { start: 0, end: 3 }, { start: 3, end: 6 }])).toEqual([{ start: 0, end: 9 }]);
  });

  it("clips fasts to the day and splits the rest into eating", () => {
    // Overnight fast 8 pm → noon local, then another from 8 pm.
    const fasts = [
      fast({ startAt: "2026-10-17T02:00:00Z", endAt: "2026-10-17T18:00:00Z" }),
      fast({ startAt: "2026-10-18T02:00:00Z", endAt: "2026-10-18T18:00:00Z" }),
    ];
    const iv = fastingIntervals(fasts, day, now);
    expect(iv).toEqual([
      { start: day.start, end: Date.parse("2026-10-17T18:00:00Z") },
      { start: Date.parse("2026-10-18T02:00:00Z"), end: day.end },
    ]);
    const segs = daySegments(fasts, day, now);
    expect(segs.map((s) => s.kind)).toEqual(["fasting", "eating", "fasting"]);
    const h = segmentHours(segs);
    expect(h.fasting).toBe(16);
    expect(h.eating).toBe(8);
  });

  it("counts a running fast up to now and leaves the rest as future", () => {
    const mid = day.start + 15 * HOUR_MS; // 3 pm local
    const segs = daySegments([fast({ startAt: "2026-10-17T16:00:00Z" })], day, mid);
    expect(segs.map((s) => s.kind)).toEqual(["eating", "fasting", "future"]);
    expect(segs[1].end).toBe(mid);
    expect(segmentHours(segs).future).toBe(9);
  });

  it("ignores deleted fasts", () => {
    const f = fast({ startAt: "2026-10-17T02:00:00Z", endAt: "2026-10-17T18:00:00Z", deletedAt: "x" });
    expect(daySegments([f], day, now).map((s) => s.kind)).toEqual(["eating"]);
  });

  it("places markers along the day", () => {
    expect(fractionOfDay(day.start + 12 * HOUR_MS, day)).toBe(0.5);
    expect(fractionOfDay(day.end + 1, day)).toBe(1);
  });
});

describe("copy yesterday", () => {
  it("keeps the local clock time and skips times not reached yet", () => {
    const y = [
      entry({ at: "2026-10-16T18:00:00Z", name: "Lunch", proteinG: 40 }), // noon local
      entry({ at: "2026-10-17T01:00:00Z", name: "Dinner" }), // 7 pm local
      entry({ at: "2026-10-16T14:00:00Z", name: "Gone", deletedAt: "x" }),
    ];
    const now = Date.parse("2026-10-17T20:00:00Z"); // 2 pm local
    const plan = copyDayPlan(y, "2026-10-17", TZ, now);
    expect(plan.copy).toHaveLength(1);
    expect(plan.copy[0].at).toBe("2026-10-17T18:00:00.000Z");
    expect(plan.copy[0].template.name).toBe("Lunch");
    expect(plan.copy[0].template.proteinG).toBe(40);
    expect(plan.later).toBe(1);
  });

  it("strips record fields from templates", () => {
    const t = templateOf(entry({ at: "2026-10-16T18:00:00Z", name: "Eggs", fastId: "f1", qty: 3, unit: "egg" }));
    expect(t).not.toHaveProperty("id");
    expect(t).not.toHaveProperty("at");
    expect(t).not.toHaveProperty("fastId");
    expect(favoriteLabel(t)).toBe("Eggs · 3 egg");
  });
});
