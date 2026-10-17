import { describe, expect, it } from "vitest";
import type { BodyMetric, Fast, Readiness, WorkoutLog, WorkoutSet } from "./types";
import {
  fastingHoursSeries,
  hrSeries,
  isoWeek,
  liftSeries,
  loggedLifts,
  metricSeries,
  mondayOf,
  quickScores,
  readinessScore,
  sessionsPerWeek,
  suggestsEasyDay,
  weeklySummary,
} from "./progress";

const TZ = "America/Denver";
const base = { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
let n = 0;
const id = () => `id${n++}`;

function log(p: Partial<WorkoutLog> & { date: string }): WorkoutLog {
  return {
    ...base,
    id: id(),
    templateId: "A",
    variant: "full",
    startedAt: `${p.date}T15:00:00Z`,
    endedAt: `${p.date}T16:00:00Z`,
    sets: [],
    ...p,
  };
}

function set(exerciseId: string, loadLb?: number): WorkoutSet {
  return { exerciseId, setIndex: 0, reps: 8, loadLb, done: true };
}

function fast(startAt: string, hours: number, target = 16): Fast {
  return {
    ...base,
    id: id(),
    protocol: "16:8",
    targetHours: target,
    startAt,
    endAt: new Date(Date.parse(startAt) + hours * 3_600_000).toISOString(),
    status: hours >= target ? "completed" : "broken",
  };
}

describe("readiness", () => {
  it("averages the three scores, higher is better", () => {
    expect(readinessScore({ sleep: 3, soreness: 4, energy: 5 })).toBe(4);
  });

  it("suggests an easy day at 2 or below", () => {
    expect(suggestsEasyDay({ sleep: 2, soreness: 2, energy: 2 })).toBe(true);
    expect(suggestsEasyDay({ sleep: 1, soreness: 2, energy: 3 })).toBe(true);
    expect(suggestsEasyDay({ sleep: 2, soreness: 2, energy: 3 })).toBe(false);
  });
});

describe("weeks", () => {
  it("finds the Monday and ISO week", () => {
    expect(mondayOf("2026-10-17")).toBe("2026-10-12"); // Saturday
    expect(mondayOf("2026-10-18")).toBe("2026-10-12"); // Sunday
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(isoWeek("2026-10-17")).toBe("2026-W42");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
  });
});

describe("chart series", () => {
  const now = Date.parse("2026-10-17T20:00:00Z");

  it("fasting hours per day, with empty days as 0", () => {
    const s = fastingHoursSeries([fast("2026-10-16T02:00:00Z", 17)], now, TZ, 3);
    expect(s.map((p) => p.date)).toEqual(["2026-10-15", "2026-10-16", "2026-10-17"]);
    expect(s[1]).toEqual({ date: "2026-10-16", value: 17, hit: true });
    expect(s[2].value).toBe(0);
  });

  it("counts done sessions per week", () => {
    const logs = [
      log({ date: "2026-10-12" }),
      log({ date: "2026-10-14" }),
      log({ date: "2026-10-07" }),
      log({ date: "2026-10-15", endedAt: undefined }), // not finished, nothing ticked
      log({ date: "2026-10-16", deletedAt: "x" }),
    ];
    expect(sessionsPerWeek(logs, now, TZ, 2)).toEqual([
      { date: "2026-10-05", value: 1 },
      { date: "2026-10-12", value: 2 },
    ]);
  });

  it("tracks the heaviest load per date", () => {
    const logs = [
      log({ date: "2026-10-12", sets: [set("goblet-squat", 35), set("goblet-squat", 40), set("row")] }),
      log({ date: "2026-10-14", sets: [set("goblet-squat", 45), set("kb-swing", 40)] }),
      log({ date: "2026-10-16", sets: [set("kb-swing", 40)] }),
    ];
    expect(loggedLifts(logs)).toEqual([
      { exerciseId: "goblet-squat", sessions: 2 },
      { exerciseId: "kb-swing", sessions: 2 },
    ]);
    expect(liftSeries(logs, "goblet-squat")).toEqual([
      { date: "2026-10-12", value: 40 },
      { date: "2026-10-14", value: 45 },
    ]);
  });

  it("groups Quick 20 scores by template", () => {
    const logs = [
      log({ date: "2026-10-09", templateId: "Q2", quick: { rounds: 6, rungs: 0, extraReps: 2 } }),
      log({ date: "2026-10-02", templateId: "Q2", quick: { rounds: 5, rungs: 0, extraReps: 0 } }),
      log({ date: "2026-10-16", templateId: "Q3", quick: { rounds: 0, rungs: 9, extraReps: 0 } }),
      log({ date: "2026-10-16", templateId: "A" }),
    ];
    const s = quickScores(logs);
    expect(s.map((q) => [q.templateId, q.metric])).toEqual([
      ["Q2", "rounds"],
      ["Q3", "rungs"],
    ]);
    expect(s[0].points.map((p) => p.value)).toEqual([5, 6]);
  });

  it("summarizes 4×4 heart rate", () => {
    const logs = [
      log({ date: "2026-10-14", templateId: "C", hr: { intervals: [{ peak: 160, avg: 150 }, { peak: 165, avg: 155 }] } }),
      log({ date: "2026-10-15", templateId: "C" }),
    ];
    expect(hrSeries(logs)).toEqual([{ date: "2026-10-14", peak: 165, avg: 153 }]);
  });

  it("lists one body metric over time", () => {
    const m: BodyMetric[] = [
      { ...base, id: id(), at: "2026-10-16T14:00:00Z", weightLb: 200 },
      { ...base, id: id(), at: "2026-10-10T14:00:00Z", weightLb: 202, waistIn: 38 },
      { ...base, id: id(), at: "2026-10-12T14:00:00Z", restingHr: 60 },
    ];
    expect(metricSeries(m, "weightLb", TZ)).toEqual([
      { date: "2026-10-10", value: 202 },
      { date: "2026-10-16", value: 200 },
    ]);
  });
});

describe("weekly summary", () => {
  it("compares this week with last", () => {
    const now = Date.parse("2026-10-17T20:00:00Z"); // Sat; this week = Oct 12–18
    const fasts = [
      fast("2026-10-13T02:00:00Z", 16.5),
      fast("2026-10-14T02:00:00Z", 12),
      fast("2026-10-07T02:00:00Z", 18),
    ];
    const logs = [log({ date: "2026-10-12" }), log({ date: "2026-10-06" }), log({ date: "2026-10-08" })];
    const readiness: Readiness[] = [
      { ...base, id: id(), date: "2026-10-13", sleep: 4, soreness: 4, energy: 4 },
      { ...base, id: id(), date: "2026-10-14", sleep: 2, soreness: 2, energy: 2 },
    ];
    const metrics: BodyMetric[] = [
      { ...base, id: id(), at: "2026-10-08T14:00:00Z", weightLb: 201 },
      { ...base, id: id(), at: "2026-10-16T14:00:00Z", weightLb: 199.5 },
    ];
    const { thisWeek, lastWeek } = weeklySummary({ fasts, logs, readiness, metrics }, now, TZ);
    expect(thisWeek).toMatchObject({
      monday: "2026-10-12",
      fastsEnded: 2,
      fastsCompleted: 1,
      hitRate: 0.5,
      avgHours: 14.25,
      sessions: 1,
      avgReadiness: 3,
      weightChange: -1.5,
    });
    expect(lastWeek).toMatchObject({ fastsEnded: 1, fastsCompleted: 1, sessions: 2, avgReadiness: undefined, weightChange: undefined });
  });
});
