// Set rows for the active logger, prefilled from the last session. Pure.
import { parseRange } from "./progression";
import type { SessionBlock, SessionItem, WorkoutLog, WorkoutSet } from "./types";

export interface Row {
  blockIndex: number;
  blockLabel: string;
  round: number;
  rounds: number;
  item: SessionItem;
  /** 0-based set number for this exercise across the session. */
  setIndex: number;
  /** Seconds of rest after this set (0 = go straight to the next move). */
  restAfter: number;
}

function restFor(item: SessionItem, b: SessionBlock, lastInRound: boolean, multiItem: boolean): number {
  const note = item.note ?? "";
  if (/every 30 s/.test(note)) return 20;
  if (/each minute|per minute|top of each minute/.test(note)) return 40;
  if (item.restSec) return item.restSec;
  if (b.rounds && b.rounds > 1) return lastInRound ? (b.restSec ?? 60) : 0;
  if ((item.sets ?? 1) > 1 && !multiItem) return 60;
  return 0;
}

export function buildRows(blocks: SessionBlock[]): Row[] {
  const rows: Row[] = [];
  const counts = new Map<string, number>();
  blocks.forEach((b, bi) => {
    const rounds = b.rounds ?? 1;
    for (let r = 0; r < rounds; r++) {
      b.items.forEach((item, ii) => {
        const sets = item.sets ?? 1;
        for (let s = 0; s < sets; s++) {
          const setIndex = counts.get(item.exerciseId) ?? 0;
          counts.set(item.exerciseId, setIndex + 1);
          const lastInRound = ii === b.items.length - 1 && s === sets - 1;
          rows.push({ blockIndex: bi, blockLabel: b.label, round: r + 1, rounds, item, setIndex, restAfter: restFor(item, b, lastInRound, b.items.length > 1) });
        }
      });
    }
  });
  return rows;
}

function defaultReps(item: SessionItem): number | undefined {
  if (typeof item.reps === "number") return item.reps;
  const range = parseRange(item.reps);
  if (range) return range[0];
  return undefined;
}

/** Pre-fill each row with the last session's values for the same exercise and set number. */
export function prefill(rows: Row[], last: WorkoutLog | null | undefined): WorkoutSet[] {
  const prev = new Map((last?.sets ?? []).map((s) => [`${s.exerciseId}#${s.setIndex}`, s]));
  return rows.map((r) => {
    const p = prev.get(`${r.item.exerciseId}#${r.setIndex}`);
    // After a load increase, start again at the bottom of the range rather than last time's reps.
    const heavier = (r.item.loadLb ?? 0) > (p?.loadLb ?? 0) && p?.loadLb !== undefined;
    return {
      exerciseId: r.item.exerciseId,
      setIndex: r.setIndex,
      reps: heavier ? defaultReps(r.item) : (p?.reps ?? defaultReps(r.item)),
      seconds: p?.seconds ?? r.item.seconds,
      meters: Math.max(p?.meters ?? 0, r.item.meters ?? 0) || undefined,
      // The plan's load wins when it went up (progression); otherwise last time's.
      loadLb: Math.max(p?.loadLb ?? 0, r.item.loadLb ?? 0) || undefined,
      done: false,
    };
  });
}
