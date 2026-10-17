import { describe, expect, it } from "vitest";
import { sessions } from "@/seed/sessions";
import {
  advance,
  endedEarly,
  finishedSegments,
  build4x4,
  buildQuick20,
  bump,
  createRun,
  cuesBetween,
  endRun,
  followAlong,
  pause,
  position,
  programSeconds,
  resume,
} from "./timer";

const T = (id: string) => sessions.find((s) => s.id === id)!;
const S = 1000;
const MIN = 60 * S;

describe("Quick 20 programs", () => {
  it("Q1 is 3:00 prep + 15 one-minute rounds cycling swing → clean & press → goblet squat + 2:00 downshift", () => {
    const segs = buildQuick20(T("Q1"));
    expect(segs[0]).toMatchObject({ kind: "prep", durationSec: 180 });
    const work = segs.filter((s) => s.kind === "work");
    expect(work).toHaveLength(15);
    expect(work.every((w) => w.durationSec === 60)).toBe(true);
    expect(work.slice(0, 4).map((w) => w.items[0].exerciseId)).toEqual([
      "kb-swing-2h",
      "kb-press",
      "kb-goblet-squat",
      "kb-swing-2h",
    ]);
    // Next-move preview
    expect(work[0].items[1].exerciseId).toBe("kb-press");
    expect(segs[segs.length - 1]).toMatchObject({ kind: "downshift", durationSec: 120 });
    expect(programSeconds(segs)).toBe(20 * 60);
  });

  it("fits every Quick 20 into about 20 minutes", () => {
    for (const id of ["Q1", "Q3", "Q4", "Q5", "Q7", "Q8", "Q9"]) {
      const sec = programSeconds(buildQuick20(T(id)));
      expect(sec, id).toBeGreaterThanOrEqual(19 * 60);
      expect(sec, id).toBeLessThanOrEqual(21 * 60);
    }
    // Q6: 5 min swings + 1 min rest + 10 min get-ups.
    expect(programSeconds(buildQuick20(T("Q6")))).toBe(3 * 60 + 5 * 60 + 60 + 10 * 60 + 2 * 60);
  });

  it("Q5 runs three 20/10 ×8 blocks with 60 s between them, block 3 alternating push-up / dead bug", () => {
    const segs = buildQuick20(T("Q5"));
    const work = segs.filter((s) => s.kind === "work" && s.mode === "TABATA");
    expect(work).toHaveLength(24);
    expect(work[0].items[0].exerciseId).toBe("kb-swing-2h");
    expect(work[8].items[0].exerciseId).toBe("kb-rack-lunge");
    expect(work.slice(16, 20).map((w) => w.items[0].exerciseId)).toEqual(["push-up", "dead-bug", "push-up", "dead-bug"]);
    expect(segs.filter((s) => s.label === "Block rest")).toHaveLength(2);
  });

  it("Q2 rounds wait for Next, with 60 s rest between", () => {
    const segs = buildQuick20(T("Q2"));
    const work = segs.filter((s) => s.mode === "ROUNDS");
    expect(work).toHaveLength(5);
    expect(work.every((w) => w.durationSec === null)).toBe(true);
  });
});

describe("4×4", () => {
  it("builds warm-up, 4 intervals with HR entry, cool-down", () => {
    const segs = build4x4(T("C"), "full");
    expect(segs[0]).toMatchObject({ kind: "warmup", durationSec: 600 });
    expect(segs.filter((s) => s.hrEntry)).toHaveLength(4);
    expect(segs[segs.length - 1]).toMatchObject({ kind: "cooldown", durationSec: 300 });
  });
  it("uses the progression's interval count, and 2 on a short day", () => {
    expect(build4x4(T("C"), "full", 3).filter((s) => s.hrEntry)).toHaveLength(3);
    expect(build4x4(T("C"), "short").filter((s) => s.hrEntry)).toHaveLength(2);
  });
});

describe("run state is derived from timestamps", () => {
  const segs = buildQuick20(T("Q1"));
  const t0 = 1_000_000;

  it("knows where it is after 2 minutes in the background", () => {
    const run = createRun(segs, t0);
    // No ticks in between: jump straight to 5:30 later.
    const p = position(run, t0 + 5 * MIN + 30 * S);
    // 3:00 prep, then minute 3 of the EMOM (index 3 → goblet squat), 30 s left.
    expect(p.index).toBe(3);
    expect(p.segment!.items[0].exerciseId).toBe("kb-goblet-squat");
    expect(p.segRemainingMs).toBe(30 * S);
  });

  it("excludes paused time", () => {
    let run = createRun(segs, t0);
    run = pause(run, t0 + MIN);
    expect(position(run, t0 + 10 * MIN).totalActiveMs).toBe(MIN);
    run = resume(run, t0 + 10 * MIN);
    expect(position(run, t0 + 11 * MIN).totalActiveMs).toBe(2 * MIN);
  });

  it("survives a JSON round-trip (saved to IndexedDB)", () => {
    const run = pause(createRun(segs, t0), t0 + 90 * S);
    const back = JSON.parse(JSON.stringify(run));
    expect(position(back, t0 + 20 * MIN)).toEqual(position(run, t0 + 20 * MIN));
  });

  it("advances open and timed segments with Next", () => {
    const q2 = buildQuick20(T("Q2"));
    let run = createRun(q2, t0);
    run = advance(run, t0 + 10 * S); // skip prep early
    expect(position(run, t0 + 11 * S).segment!.mode).toBe("ROUNDS");
    // Open segment does not end by itself.
    expect(position(run, t0 + 30 * MIN).index).toBe(1);
    run = advance(run, t0 + 2 * MIN);
    expect(position(run, t0 + 2 * MIN + S).segment!.kind).toBe("rest");
  });

  it("ends early and keeps counters", () => {
    let run = createRun(buildQuick20(T("Q4")), t0);
    run = bump(bump(run, "rounds"), "rounds");
    run = endRun(run, t0 + 10 * MIN);
    expect(position(run, t0 + 30 * MIN).done).toBe(true);
    expect(run.counters.rounds).toBe(2);
  });

  it("emits countdown ticks and segment changes", () => {
    const run = createRun(segs, t0);
    expect(cuesBetween(run, t0 + 176.5 * S, t0 + 177.5 * S)).toEqual([{ type: "tick", secondsLeft: 3 }]);
    expect(cuesBetween(run, t0 + 179.5 * S, t0 + 180.5 * S)).toEqual([{ type: "segment", index: 1 }]);
    expect(cuesBetween(run, t0 + 19.9 * MIN, t0 + 21 * MIN)).toEqual([{ type: "done" }]);
  });
});

describe("follow-along", () => {
  it("times holds per side and waits on reps", () => {
    const segs = followAlong([
      { label: "M", items: [{ exerciseId: "couch-stretch", sets: 2, seconds: 60, perSide: true }, { exerciseId: "cat-camel", reps: 8 }] },
    ]);
    expect(segs.map((s) => s.durationSec)).toEqual([60, 60, 60, 60, null]);
  });
});

describe("review fixes", () => {
  const t0 = 1_000_000;
  it("knows a run ended early and counts only finished work", () => {
    const segs = buildQuick20(T("Q1"));
    const run = endRun(createRun(segs, t0), t0 + 5 * MIN);
    expect(endedEarly(run)).toBe(true);
    expect(finishedSegments(run, t0 + 30 * MIN).filter((s) => s.kind === "work")).toHaveLength(2);
    const full = endRun(createRun(segs, t0), t0 + 21 * MIN);
    expect(endedEarly(full)).toBe(false);
    expect(finishedSegments(full, t0 + 30 * MIN).filter((s) => s.kind === "work")).toHaveLength(15);
  });

  it("previews the next block, not the next move in the cycle, at block ends", () => {
    const q1 = buildQuick20(T("Q1")).filter((s) => s.kind === "work");
    expect(q1[14].items).toHaveLength(1);
    const q5 = buildQuick20(T("Q5")).filter((s) => s.mode === "TABATA");
    expect(q5[23].items).toHaveLength(1);
    expect(q5[7].items[1].exerciseId).toBe("kb-rack-lunge");
  });

  it("previews side 2 of a per-side hold", () => {
    const segs = followAlong([{ label: "M", items: [{ exerciseId: "couch-stretch", seconds: 60, perSide: true }, { exerciseId: "cat-camel", reps: 8 }] }]);
    expect(segs[0].items.map((i) => i.exerciseId)).toEqual(["couch-stretch", "couch-stretch"]);
    expect(segs[1].items.map((i) => i.exerciseId)).toEqual(["couch-stretch", "cat-camel"]);
  });
});
