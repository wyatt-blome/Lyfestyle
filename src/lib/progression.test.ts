import { describe, expect, it } from "vitest";
import { applyResult, initialState, ladderKey, nextLoad, prescribe, qualifies, quickHint, type ExerciseResult } from "./progression";

const tenSets = (rpe?: number): ExerciseResult => ({
  exerciseId: "kb-swing-2h",
  setsPlanned: 10,
  sets: Array.from({ length: 10 }, () => ({ reps: 10, loadLb: 40, rpe, done: true })),
});

describe("staged ladders", () => {
  it("moves the swing to one-hand after 2 qualifying sessions", () => {
    let s = initialState("kb-swing-2h");
    const u1 = applyResult("kb-swing-2h", s, tenSets(7), []);
    expect(u1.advanced).toBe(false);
    s = u1.next;
    const u2 = applyResult("kb-swing-2h", s, tenSets(6), []);
    expect(u2.advanced).toBe(true);
    expect(u2.next.stage).toBe(2);
    const shown = prescribe({ exerciseId: "kb-swing-2h", sets: 10, reps: 10, loadLb: 40 }, { ...u2.next, id: "x", createdAt: "", updatedAt: "" });
    expect(shown.exerciseId).toBe("kb-swing-1h");
  });

  it("resets the count after a non-qualifying session", () => {
    let s = applyResult("kb-swing-2h", initialState("kb-swing-2h"), tenSets(7), []).next;
    s = applyResult("kb-swing-2h", s, tenSets(9), []).next; // a grind
    expect(s.consecutiveHits).toBe(0);
    const partial = { ...tenSets(6), sets: tenSets(6).sets.slice(0, 7) };
    expect(qualifies(partial)).toBe(false);
  });

  it("maps Big 3 and 4×4 exercises to their ladders", () => {
    expect(ladderKey("bird-dog")).toBe("mcgill-big3");
    expect(ladderKey("interval-bike")).toBe("4x4");
    expect(ladderKey("kb-swing-1h")).toBe("kb-swing-2h");
    expect(ladderKey("db-row")).toBeNull();
  });

  it("shows the Big 3 pyramid from the stage", () => {
    const st = { ...initialState("mcgill-big3"), stage: 3, id: "x", createdAt: "", updatedAt: "" };
    expect(prescribe({ exerciseId: "bird-dog", reps: "5-3-1", perSide: true }, st).reps).toBe("8-6-4");
  });
});

describe("double progression", () => {
  const range: [number, number] = [6, 10];
  const result = (reps: number, rpe = 7): ExerciseResult => ({
    exerciseId: "db-bench-press",
    setsPlanned: 3,
    sets: [1, 2, 3].map(() => ({ reps, rpe, loadLb: 25, done: true })),
  });

  it("moves to the next load at the bottom of the range after hitting the top twice", () => {
    const s0 = { ...initialState("db-bench-press", { exerciseId: "db-bench-press", reps: "6-10" }), currentLoadLb: 25 };
    const s1 = applyResult("db-bench-press", s0, result(10), [20, 25, 35], range).next;
    const u = applyResult("db-bench-press", s1, result(10), [20, 25, 35], range);
    expect(u.advanced).toBe(true);
    expect(u.next.currentLoadLb).toBe(35);
    expect(u.next.repTarget).toBe(6);
  });

  it("does not advance below the top of the range or at RPE 8", () => {
    const s0 = { ...initialState("db-bench-press", { exerciseId: "db-bench-press", reps: "6-10" }), currentLoadLb: 25 };
    expect(applyResult("db-bench-press", s0, result(9), [35], range).next.consecutiveHits).toBe(0);
    expect(applyResult("db-bench-press", s0, result(10, 8), [35], range).next.consecutiveHits).toBe(0);
  });

  it("picks the next heavier weight", () => {
    expect(nextLoad(15, [10, 15, 40])).toBe(40);
    expect(nextLoad(40, [10, 15, 40])).toBeNull();
  });
});

describe("Quick 20 hint", () => {
  it("fires when the score rises two sessions in a row", () => {
    expect(quickHint([5, 6, 7])).toMatch(/add 1 rep/);
    expect(quickHint([5, 6, 6])).toBeNull();
    expect(quickHint([6, 7])).toBeNull();
  });
});

describe("stages set the dose, not just the label", () => {
  const at = (key: string, stage: number) => ({ ...initialState(key), stage, id: "x", createdAt: "", updatedAt: "" });
  it("goblet squat, carry and press follow their stage", () => {
    expect(prescribe({ exerciseId: "kb-goblet-squat", reps: "5-8", loadLb: 40 }, at("kb-goblet-squat", 3)).reps).toBe(10);
    expect(prescribe({ exerciseId: "kb-suitcase-carry", meters: 30, perSide: true, loadLb: 40 }, at("kb-suitcase-carry", 3)).meters).toBe(60);
    expect(prescribe({ exerciseId: "kb-suitcase-carry", meters: 30, perSide: true, loadLb: 40 }, at("kb-suitcase-carry", 1)).meters).toBe(20);
    expect(prescribe({ exerciseId: "kb-press", reps: 5, perSide: true, loadLb: 15 }, at("kb-press", 2)).reps).toBe("1-5 ×3");
    // Timed carries (a held minute) keep their time.
    expect(prescribe({ exerciseId: "kb-suitcase-carry", seconds: 60, loadLb: 40 }, at("kb-suitcase-carry", 3)).meters).toBeUndefined();
  });
});
