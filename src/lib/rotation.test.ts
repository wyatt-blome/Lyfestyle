import { describe, expect, it } from "vitest";
import { mondayOf, planForDay, weekInfo } from "./rotation";
import { defaultRotation } from "@/seed/sessions";
import type { Rotation } from "./types";

// 2026-10-05 is a Monday.
const rot: Rotation = { ...defaultRotation, startDate: "2026-10-05" };

describe("rotation", () => {
  it("finds the Monday of a week", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(mondayOf("2026-10-08")).toBe("2026-10-05");
  });

  it("shows A on Monday, M Tuesday, C Wednesday, B Thursday", () => {
    expect(planForDay(rot, "2026-10-05").sessionId).toBe("A");
    expect(planForDay(rot, "2026-10-06").sessionId).toBe("M");
    expect(planForDay(rot, "2026-10-07").sessionId).toBe("C");
    expect(planForDay(rot, "2026-10-08").sessionId).toBe("B");
  });

  it("cycles the Friday Quick 20 by cycle week", () => {
    expect(planForDay(rot, "2026-10-09").sessionId).toBe("Q1");
    expect(planForDay(rot, "2026-10-16").sessionId).toBe("Q2");
    expect(planForDay(rot, "2026-11-13").sessionId).toBe("Q6");
    expect(planForDay(rot, "2026-11-20").sessionId).toBe("Q1");
  });

  it("flags every 6th week as a deload", () => {
    expect(weekInfo(rot, "2026-11-09")).toEqual({ week: 6, cycleWeek: 6, deload: true });
    expect(weekInfo(rot, "2026-11-16").deload).toBe(false);
    expect(weekInfo(rot, "2026-12-21")).toEqual({ week: 12, cycleWeek: 6, deload: true });
  });

  it("rests on Sunday with the optional Daily 10", () => {
    const p = planForDay(rot, "2026-10-11");
    expect(p.sessionId).toBe("REST");
    expect(p.optional).toBe("DAILY10");
  });

  it("moves a missed Wednesday 4×4 to Saturday, replacing Z", () => {
    const missed = planForDay(rot, "2026-10-10", () => false);
    expect(missed.sessionId).toBe("C");
    const done = planForDay(rot, "2026-10-10", (d, id) => d === "2026-10-07" && id === "C");
    expect(done.sessionId).toBe("Z");
    expect(done.alternative).toBe("Q2");
  });

  it("never doubles a missed day", () => {
    // Missing Monday's A does not put A on Tuesday.
    expect(planForDay(rot, "2026-10-06", () => false).sessionId).toBe("M");
  });

  it("does not move a 4×4 from before the app was first used mid-week", () => {
    const firstOpenedSaturday: Rotation = { ...rot, startDate: "2026-10-10" };
    expect(planForDay(firstOpenedSaturday, "2026-10-10").sessionId).toBe("Z");
    expect(weekInfo(firstOpenedSaturday, "2026-10-10").week).toBe(1);
    // The next Saturday still applies the rule.
    expect(planForDay(firstOpenedSaturday, "2026-10-17").sessionId).toBe("C");
  });

  it("does not move a 4×4 from before the rotation started", () => {
    const late: Rotation = { ...rot, startDate: "2026-10-09" };
    expect(planForDay(late, "2026-10-10").sessionId).toBe("Z");
  });
});
