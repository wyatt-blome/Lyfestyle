// Progression engine (spec Part 5). Pure.
//  - Staged ladders (swing, TGU, press, goblet squat, suitcase carry, Big 3, 4×4): two qualifying
//    sessions in a row move you to the next stage.
//  - Double progression for everything else with a rep range: top of the range at RPE ≤ 7 in two
//    sessions in a row → next load, back to the bottom of the range.
//  - Quick 20 scores: +1 two sessions in a row → add a rep to the hardest move or a bigger bell.
import type { ProgressionState, SessionItem, WorkoutLog } from "./types";

export const HITS_TO_ADVANCE = 2;
export const MAX_RPE_TO_QUALIFY = 7;

export interface Stage {
  label: string;
  /** Exercise to show instead of the template's (swing stage 2 → one-hand). */
  exerciseId?: string;
  loadLb?: number;
  reps?: number | string;
  /** Carry distance per side. */
  meters?: number;
  note?: string;
  /** 4×4 interval count. */
  intervals?: number;
}

/** Ladders keyed by the exercise id used in the templates. */
export const LADDERS: Record<string, Stage[]> = {
  "kb-swing-2h": [
    { label: "Two-hand 10×10 in 5 min", exerciseId: "kb-swing-2h", loadLb: 40 },
    { label: "One-hand alternating 10×10, crisp", exerciseId: "kb-swing-1h", loadLb: 40, note: "alternate hands each set" },
    { label: "One-hand, nasal recovery between sets", exerciseId: "kb-swing-1h", loadLb: 40, note: "nose-breathe between sets" },
    { label: "Paused swings or a heavier bell", exerciseId: "kb-swing-1h", loadLb: 40, note: "pause at the top, or go heavier" },
  ],
  "kb-tgu": [
    { label: "10 lb, 5/side in 10 min", loadLb: 10 },
    { label: "15 lb", loadLb: 15 },
    { label: "Dumbbell 20–35 lb", loadLb: 20, note: "DB get-ups; build to 35 lb smooth" },
    { label: "40 lb kettlebell (long-term goal)", loadLb: 40, note: "only once 35 lb DB get-ups are smooth" },
  ],
  "kb-press": [
    { label: "15 lb ladders 1-2-3 ×3", loadLb: 15, reps: "1-2-3 ×3" },
    { label: "15 lb ladders 1-5 ×3", loadLb: 15, reps: "1-5 ×3" },
    { label: "Dumbbell 20–25 lb", loadLb: 20 },
    { label: "40 lb kettlebell", loadLb: 40 },
  ],
  "kb-goblet-squat": [
    { label: "3×5 paused", loadLb: 40, reps: 5, note: "2 s pause" },
    { label: "3×8", loadLb: 40, reps: 8 },
    { label: "3×10, 3 s lowering", loadLb: 40, reps: 10, note: "3 s lowering" },
    { label: "1¼ reps", loadLb: 40, reps: 8, note: "1¼ reps" },
  ],
  "kb-suitcase-carry": [
    { label: "20 m/side", loadLb: 40, meters: 20 },
    { label: "40 m/side", loadLb: 40, meters: 40 },
    { label: "60 m/side", loadLb: 40, meters: 60 },
    { label: "KB + DB on the same side", loadLb: 40, meters: 60, note: "add a DB in the same hand" },
  ],
  "mcgill-big3": [
    { label: "5-3-1", reps: "5-3-1" },
    { label: "6-4-2", reps: "6-4-2" },
    { label: "8-6-4", reps: "8-6-4" },
    { label: "10-8-6", reps: "10-8-6" },
  ],
  "4x4": [
    { label: "3 intervals at ~85%", intervals: 3, note: "~85% HRmax" },
    { label: "4 intervals at 85–90%", intervals: 4, note: "85–90% HRmax" },
    { label: "4 intervals at 90–95%", intervals: 4, note: "90–95% HRmax" },
  ],
};

export const BIG3_IDS = ["mcgill-curl-up", "side-bridge", "bird-dog"];

/** Which ladder an exercise belongs to. */
export function ladderKey(exerciseId: string): string | null {
  if (BIG3_IDS.includes(exerciseId)) return "mcgill-big3";
  if (exerciseId === "kb-swing-1h") return "kb-swing-2h";
  if (exerciseId.startsWith("interval-")) return "4x4";
  return LADDERS[exerciseId] ? exerciseId : null;
}

export function initialState(key: string, item?: SessionItem): Omit<ProgressionState, "id" | "createdAt" | "updatedAt"> {
  const range = parseRange(item?.reps);
  return {
    exerciseId: key,
    stage: 1,
    currentLoadLb: LADDERS[key]?.[0]?.loadLb ?? item?.loadLb ?? 0,
    repTarget: range ? range[0] : typeof item?.reps === "number" ? item.reps : 0,
    consecutiveHits: 0,
  };
}

export function stageOf(key: string, state?: Pick<ProgressionState, "stage">): Stage | null {
  const l = LADDERS[key];
  if (!l) return null;
  return l[Math.min(l.length, Math.max(1, state?.stage ?? 1)) - 1];
}

/** "6-10" → [6, 10]; numbers and other strings → null. */
export function parseRange(reps: SessionItem["reps"]): [number, number] | null {
  if (typeof reps !== "string") return null;
  const m = reps.match(/^(\d+)\s*-\s*(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** Apply the template's prescription plus the progression stage for display. */
export function prescribe(item: SessionItem, state?: ProgressionState): SessionItem & { stageLabel?: string } {
  const key = ladderKey(item.exerciseId);
  if (key && LADDERS[key] && key !== "4x4") {
    const st = stageOf(key, state)!;
    const swingSwap = key === "kb-swing-2h" && item.exerciseId === "kb-swing-2h" ? st.exerciseId : undefined;
    return {
      ...item,
      exerciseId: swingSwap ?? item.exerciseId,
      // Templates keep the light bells used in Quick 20 flows (e.g. 15 lb press); stages only raise.
      loadLb: st.loadLb !== undefined && item.loadLb !== undefined ? Math.max(st.loadLb, item.loadLb) : item.loadLb,
      // The stage sets the dose: Big 3 pyramid, goblet-squat and press reps, carry distance.
      reps: st.reps !== undefined && item.reps !== undefined ? st.reps : item.reps,
      meters: st.meters !== undefined && item.meters !== undefined ? st.meters : item.meters,
      note: [item.note, st.note].filter(Boolean).join("; ") || undefined,
      stageLabel: st.label,
    };
  }
  const range = parseRange(item.reps);
  if (range && state && state.currentLoadLb) {
    return { ...item, loadLb: state.currentLoadLb, reps: `${state.repTarget}-${range[1]}`, stageLabel: `${state.currentLoadLb} lb` };
  }
  return item;
}

/** Next heavier load from the available gear. */
export function nextLoad(current: number, available: number[]): number | null {
  const up = available.filter((w) => w > current).sort((a, b) => a - b);
  return up[0] ?? null;
}

export interface ExerciseResult {
  exerciseId: string;
  setsPlanned: number;
  sets: { reps?: number; loadLb?: number; rpe?: number; done: boolean }[];
  /** Top of the rep range, when the item has one. */
  topReps?: number;
  sessionRpe?: number;
}

export function qualifies(r: ExerciseResult): boolean {
  const done = r.sets.filter((s) => s.done);
  if (done.length < r.setsPlanned || done.length === 0) return false;
  // The 4×4 is hard by design (85–95% HRmax): finishing every interval is what counts.
  if (r.exerciseId === "4x4") return true;
  const rpes = done.map((s) => s.rpe ?? r.sessionRpe).filter((x): x is number => x !== undefined);
  // Without any RPE we assume it wasn't a grind (RPE 6–8 is the plan), but 8+ never qualifies.
  if (rpes.some((x) => x > MAX_RPE_TO_QUALIFY)) return false;
  if (r.topReps !== undefined) return done.every((s) => (s.reps ?? 0) >= r.topReps!);
  return true;
}

export interface Update {
  next: Omit<ProgressionState, "id" | "createdAt" | "updatedAt">;
  advanced: boolean;
  message?: string;
}

/** One session's result → the next progression state. */
export function applyResult(
  key: string,
  prev: Omit<ProgressionState, "id" | "createdAt" | "updatedAt">,
  r: ExerciseResult,
  gear: number[],
  range?: [number, number] | null,
): Update {
  const ok = qualifies({ ...r, topReps: LADDERS[key] ? undefined : range?.[1] });
  const hits = ok ? prev.consecutiveHits + 1 : 0;
  if (hits < HITS_TO_ADVANCE) return { next: { ...prev, consecutiveHits: hits }, advanced: false };

  const ladder = LADDERS[key];
  if (ladder) {
    if (prev.stage >= ladder.length) return { next: { ...prev, consecutiveHits: 0 }, advanced: false };
    const stage = prev.stage + 1;
    const st = ladder[stage - 1];
    return {
      next: { ...prev, stage, currentLoadLb: st.loadLb ?? prev.currentLoadLb, consecutiveHits: 0 },
      advanced: true,
      message: `Next stage: ${st.label}`,
    };
  }
  if (range) {
    const load = nextLoad(prev.currentLoadLb, gear);
    if (load === null) return { next: { ...prev, consecutiveHits: 0 }, advanced: false, message: "Top of the range: add a heavier weight to your gear to progress." };
    return {
      next: { ...prev, currentLoadLb: load, repTarget: range[0], consecutiveHits: 0, stage: prev.stage + 1 },
      advanced: true,
      message: `Next: ${load} lb × ${range[0]}-${range[1]}`,
    };
  }
  return { next: { ...prev, consecutiveHits: 0 }, advanced: false };
}

/** Collapse a log's sets into results per ladder/exercise key. */
export function resultsFromLog(log: WorkoutLog, planned: Map<string, number>): Map<string, ExerciseResult> {
  const out = new Map<string, ExerciseResult>();
  for (const s of log.sets) {
    const key = ladderKey(s.exerciseId) ?? s.exerciseId;
    const r = out.get(key) ?? { exerciseId: key, setsPlanned: planned.get(key) ?? 0, sets: [], sessionRpe: log.rpe };
    r.sets.push(s);
    out.set(key, r);
  }
  return out;
}

/** Quick 20 hint: a score up by ≥ 1 in each of the last two sessions. */
export function quickHint(scores: number[]): string | null {
  if (scores.length < 3) return null;
  const [a, b, c] = scores.slice(-3);
  if (b >= a + 1 && c >= b + 1) return "Score up two sessions in a row: add 1 rep to the hardest move, or use a bigger bell on one move.";
  return null;
}

/** Score used for a Quick 20 log. */
export function quickScoreOf(log: Pick<WorkoutLog, "quick">): number {
  if (!log.quick) return 0;
  return log.quick.rungs || log.quick.rounds || 0;
}

export const LIGHT_TO_HEAVY_RULE =
  "15 → 40 lb on a move: only once you can do 2× the target reps at 15 lb with perfect form. Bridge with dumbbells.";
