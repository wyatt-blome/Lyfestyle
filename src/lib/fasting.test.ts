import { describe, expect, it } from "vitest";
import type { Fast } from "./types";
import {
  allowedDuringLongFast,
  averages,
  bestStreak,
  canStart,
  currentStreak,
  dueReminders,
  editedTimes,
  endStatus,
  entryInFast,
  longFastActive,
  overlapError,
  parseHours,
  progress,
  requiresDoctorAck,
  stageIndexAt,
  STAGES,
  targetHoursFor,
  validateTimes,
} from "./fasting";
import { HOUR_MS, toLocalInput } from "./time";

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

describe("protocols", () => {
  it("maps protocols to target hours", () => {
    expect(targetHoursFor("16:8")).toBe(16);
    expect(targetHoursFor("OMAD")).toBe(23);
    expect(targetHoursFor("48h")).toBe(48);
    expect(targetHoursFor("custom", 30)).toBe(30);
  });

  it("never returns NaN for custom hours", () => {
    expect(targetHoursFor("custom", NaN)).toBe(16);
    expect(targetHoursFor("custom", Infinity)).toBe(16);
    expect(targetHoursFor("custom", 500)).toBe(120);
  });

  it("parses custom hours leniently", () => {
    expect(parseHours("16")).toBe(16);
    expect(parseHours("16,5")).toBe(16.5);
    expect(parseHours(" 16.5 ")).toBe(16.5);
    expect(parseHours("36 h")).toBe(36);
    expect(parseHours("20hours")).toBe(20);
    expect(parseHours("abc")).toBeNull();
    expect(parseHours("16:8")).toBeNull();
    expect(parseHours("0")).toBeNull();
    expect(parseHours("")).toBeNull();
  });
});

describe("safety: fasts over 24 h", () => {
  it("requires the doctor note only above 24 h", () => {
    expect(requiresDoctorAck(24)).toBe(false);
    expect(requiresDoctorAck(24.25)).toBe(true);
    expect(canStart(36, false).ok).toBe(false);
    expect(canStart(36, true).ok).toBe(true);
    expect(canStart(16, false).ok).toBe(true);
  });

  it("restricts training once an active fast passes 24 h", () => {
    const start = Date.parse("2026-10-10T12:00:00Z");
    const f = fast({ startAt: new Date(start).toISOString(), protocol: "24h", targetHours: 24 });
    expect(longFastActive(f, start + 23 * HOUR_MS)).toBe(false);
    expect(longFastActive(f, start + 25 * HOUR_MS)).toBe(true);
    const ext = fast({ startAt: new Date(start).toISOString(), protocol: "36h", targetHours: 36 });
    expect(longFastActive(ext, start + HOUR_MS)).toBe(true);
    expect(allowedDuringLongFast("M")).toBe(true);
    expect(allowedDuringLongFast("C")).toBe(false);
    expect(allowedDuringLongFast("Q5")).toBe(false);
  });
});

describe("progress is derived from timestamps", () => {
  it("is correct after the phone was locked for 30 min", () => {
    const start = Date.parse("2026-10-10T02:00:00Z");
    const f = fast({ startAt: new Date(start).toISOString() });
    const p = progress(f, start + 8 * HOUR_MS + 30 * 60_000);
    expect(p.elapsedMs).toBe(8.5 * HOUR_MS);
    expect(p.remainingMs).toBe(7.5 * HOUR_MS);
    expect(p.projectedEnd).toBe(start + 16 * HOUR_MS);
    expect(p.fraction).toBeCloseTo(8.5 / 16);
  });

  it("classifies stages", () => {
    expect(STAGES[stageIndexAt(2)].label).toBe("Fed");
    expect(STAGES[stageIndexAt(13)].label).toMatch(/Glycogen/);
    expect(STAGES[stageIndexAt(30)].extended).toBe(true);
  });

  it("marks early ends as broken", () => {
    const f = fast({ startAt: "2026-10-10T00:00:00Z" });
    expect(endStatus(f, "2026-10-10T10:00:00Z")).toBe("broken");
    expect(endStatus(f, "2026-10-10T16:00:00Z")).toBe("completed");
  });

  it("validates edits and backdating", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    expect(validateTimes("2026-10-10T10:00:00Z", undefined, now)).toBeNull();
    expect(validateTimes("2026-10-10T13:00:00Z", undefined, now)).toMatch(/future/);
    expect(validateTimes("2026-10-10T10:00:00Z", "2026-10-10T09:00:00Z", now)).toMatch(/after/);
  });
});

describe("overlapping fasts", () => {
  const prev = fast({ id: "p", startAt: "2026-10-09T02:00:00Z", endAt: "2026-10-09T18:00:00Z" });
  const next = fast({ id: "n", startAt: "2026-10-10T02:00:00Z", endAt: "2026-10-10T18:00:00Z" });

  it("rejects a start before the previous fast ended", () => {
    expect(overlapError("2026-10-09T17:00:00Z", undefined, [prev], undefined, TZ)).toMatch(
      /^That overlaps your previous fast, which ended at Fri 12:00\sPM\.$/,
    );
    expect(overlapError("2026-10-09T18:00:00Z", undefined, [prev], undefined, TZ)).toBeNull();
    // Deleted fasts don't count.
    expect(overlapError("2026-10-09T17:00:00Z", undefined, [{ ...prev, deletedAt: "x" }], undefined, TZ)).toBeNull();
  });

  it("ignores the fast being edited and checks both ends", () => {
    expect(overlapError(prev.startAt, prev.endAt, [prev, next], "p", TZ)).toBeNull();
    expect(overlapError(prev.startAt, "2026-10-10T03:00:00Z", [prev, next], "p", TZ)).toMatch(/next fast/);
    expect(overlapError(next.startAt, undefined, [prev, fast({ id: "a", startAt: "2026-10-10T01:00:00Z" })], undefined, TZ)).toMatch(
      /current fast/,
    );
  });
});

describe("entries and the running fast", () => {
  it("links only entries from the start up to now", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    const start = "2026-10-10T02:00:00Z";
    expect(entryInFast(start, "2026-10-10T11:00:00Z", now)).toBe(true);
    expect(entryInFast(start, "2026-10-10T01:00:00Z", now)).toBe(false);
    expect(entryInFast(start, "2026-10-10T12:00:30Z", now)).toBe(true);
    // A future-dated entry doesn't offer to end the fast.
    expect(entryInFast(start, "2026-10-10T14:00:00Z", now)).toBe(false);
  });
});

describe("editing a finished fast", () => {
  it("sends only the field that changed", () => {
    const f = { startAt: "2026-10-10T02:00:30.000Z", endAt: "2026-10-10T18:00:45.000Z" };
    expect(editedTimes(f, toLocalInput(f.startAt), toLocalInput(f.endAt))).toEqual({});
    const newEnd = toLocalInput(Date.parse(f.endAt) + HOUR_MS);
    const out = editedTimes(f, toLocalInput(f.startAt), newEnd);
    expect(out.startAt).toBeUndefined();
    expect(out.endAt).toBe(new Date(Date.parse("2026-10-10T19:00:00.000Z")).toISOString());
    expect(() => editedTimes(f, "", toLocalInput(f.endAt))).toThrow(/valid/);
  });
});

describe("history", () => {
  // Fasts ending at 18:00 UTC = noon in Denver, so each lands on its own local day.
  const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-09", "2026-10-10"];
  const fasts = days.map((d) =>
    fast({ startAt: new Date(Date.parse(`${d}T18:00:00Z`) - 16 * HOUR_MS).toISOString(), endAt: `${d}T18:00:00Z` }),
  );

  it("counts the current and best streak in the device zone", () => {
    const now = Date.parse("2026-10-10T20:00:00Z");
    expect(currentStreak(fasts, now, TZ)).toBe(2);
    expect(bestStreak(fasts, TZ)).toBe(3);
    // Next morning before today's fast ends, the streak still counts from yesterday.
    expect(currentStreak(fasts, Date.parse("2026-10-11T15:00:00Z"), TZ)).toBe(2);
  });

  it("does not count a broken fast toward the streak", () => {
    const broken = fast({ startAt: "2026-10-11T08:00:00Z", endAt: "2026-10-11T18:00:00Z", status: "broken" });
    expect(currentStreak([...fasts, broken], Date.parse("2026-10-11T20:00:00Z"), TZ)).toBe(2);
  });

  it("averages over 7 days", () => {
    const a = averages(fasts, Date.parse("2026-10-10T20:00:00Z"), TZ, 7);
    expect(a.count).toBe(5);
    expect(a.avgHours).toBeCloseTo(16);
    expect(a.hitRate).toBe(1);
  });
});

describe("reminders", () => {
  it("fires halfway, target and window-closing once each", () => {
    const start = Date.parse("2026-10-10T02:00:00Z");
    const f = fast({ id: "f1", startAt: new Date(start).toISOString() });
    expect(dueReminders([f], start + 8 * HOUR_MS).map((r) => r.kind)).toEqual(["halfway"]);
    expect(dueReminders([{ ...f, remindersFired: ["halfway"] }], start + 9 * HOUR_MS)).toEqual([]);
    expect(dueReminders([{ ...f, remindersFired: ["halfway"] }], start + 16 * HOUR_MS).map((r) => r.kind)).toEqual([
      "target",
    ]);
    const ended = { ...f, status: "completed" as const, endAt: new Date(start + 16 * HOUR_MS).toISOString() };
    expect(dueReminders([ended], start + 23.6 * HOUR_MS).map((r) => r.kind)).toEqual(["window"]);
    expect(dueReminders([ended], start + 22 * HOUR_MS)).toEqual([]);
  });

  it("skips the window reminder once another fast has started", () => {
    const start = Date.parse("2026-10-10T02:00:00Z");
    const end = start + 16 * HOUR_MS;
    const ended = fast({ id: "f1", startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() });
    const next = fast({ id: "f2", startAt: new Date(end + 2 * HOUR_MS).toISOString() });
    expect(dueReminders([next, ended], start + 23.6 * HOUR_MS).map((r) => r.kind)).toEqual([]);
    // A deleted later fast doesn't count.
    expect(dueReminders([{ ...next, deletedAt: "x" }, ended], start + 23.6 * HOUR_MS).map((r) => r.kind)).toEqual(["window"]);
  });
});
