import { describe, expect, it } from "vitest";
import { sessions } from "@/seed/sessions";
import { buildRows, prefill } from "./logger";
import { sessionBlocks } from "./session";
import type { WorkoutLog } from "./types";

const A = sessions.find((s) => s.id === "A")!;

describe("logger rows", () => {
  const rows = buildRows(sessionBlocks(A, "full", false));

  it("expands rounds and sets with per-exercise set numbers", () => {
    const swings = rows.filter((r) => r.item.exerciseId === "kb-swing-2h");
    expect(swings).toHaveLength(10);
    expect(swings.map((r) => r.setIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(swings[0].restAfter).toBe(20);
    const rows2 = rows.filter((r) => r.blockLabel === "Block 2");
    expect(rows2).toHaveLength(9);
    // Rest comes after the last move of each round.
    expect(rows2.map((r) => r.restAfter)).toEqual([0, 0, 60, 0, 0, 60, 0, 0, 60]);
  });

  it("pre-fills from the last log", () => {
    const last = {
      sets: [{ exerciseId: "kb-goblet-squat", setIndex: 1, reps: 7, loadLb: 40, done: true }],
    } as WorkoutLog;
    const sets = prefill(rows, last);
    const squats = sets.filter((s) => s.exerciseId === "kb-goblet-squat");
    expect(squats[0].reps).toBe(5); // bottom of 5-8, nothing logged for set 0
    expect(squats[1].reps).toBe(7);
    expect(squats[1].loadLb).toBe(40);
  });

  it("starts at the bottom of the range after a load increase", () => {
    const rows2 = buildRows([{ label: "A", rounds: 1, items: [{ exerciseId: "db-bench-press", reps: "6-10", loadLb: 30 }] }]);
    const last = { sets: [{ exerciseId: "db-bench-press", setIndex: 0, reps: 10, loadLb: 25, done: true }] } as WorkoutLog;
    expect(prefill(rows2, last)[0]).toMatchObject({ reps: 6, loadLb: 30 });
  });
});
