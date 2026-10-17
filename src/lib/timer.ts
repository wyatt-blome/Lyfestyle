// Interval engine (spec Part 3, Quick 20 mode). A pure state machine:
//   - a program is a flat list of segments built from a session template;
//   - a run stores only timestamps (start, pauses, manual advances, end);
//   - every position is derived from those timestamps and `now`, never from tick counting,
//     so a run survives reloads, backgrounding and a locked phone.
import type { SessionBlock, SessionItem, SessionTemplate, TimerMode, TimerSpec } from "./types";

export type SegmentKind = "prep" | "work" | "rest" | "downshift" | "warmup" | "cooldown";

export interface Segment {
  kind: SegmentKind;
  label: string;
  /** Seconds; null = open-ended, ends when the user taps Next. */
  durationSec: number | null;
  /** Items shown during the segment; the first is the "current move". */
  items: SessionItem[];
  /** 1-based round within its block, and the block's round count. */
  round?: number;
  rounds?: number;
  /** The block's timer mode, for counters (AMRAP rounds, LADDER rungs). */
  mode?: TimerMode;
  /** The 4×4 work bouts take a heart-rate entry. */
  hrEntry?: boolean;
}

// ---------- Building programs ----------

const QUICK_PREP_SEC = 180;
const QUICK_DOWNSHIFT_SEC = 120;
const BETWEEN_TIMED_BLOCKS_SEC = 60;

function itemSeconds(i: SessionItem): number {
  return (i.seconds ?? 0) * (i.perSide ? 2 : 1);
}

/** Expand one timed block into segments. */
export function expandTimer(spec: TimerSpec, items: SessionItem[], label: string): Segment[] {
  const out: Segment[] = [];
  const pick = (k: number) => items[k % Math.max(1, items.length)];
  switch (spec.mode) {
    case "EMOM": {
      const slot = spec.intervalSec ?? 60;
      const n = Math.round((spec.durationSec ?? 900) / slot);
      for (let k = 0; k < n; k++) {
        // The last minute previews whatever follows the block, not the next move in the cycle.
        const items = k < n - 1 ? [pick(k), pick(k + 1)] : [pick(k)];
        out.push({ kind: "work", label, durationSec: slot, items, round: k + 1, rounds: n, mode: "EMOM" });
      }
      return out;
    }
    case "AMRAP":
    case "LADDER":
      return [{ kind: "work", label, durationSec: spec.durationSec ?? 900, items, mode: spec.mode }];
    case "TABATA": {
      const blocks = spec.blocks ?? 1;
      const rounds = spec.rounds ?? 8;
      // One move per block; a final block with spare moves alternates them (push-up / dead bug).
      const spare = items.slice(blocks - 1);
      const moveAt = (b: number, r: number) => (b < blocks - 1 ? items[b] : spare[r % spare.length]);
      for (let b = 0; b < blocks; b++) {
        const lastBlock = b === blocks - 1;
        for (let r = 0; r < rounds; r++) {
          const lastRound = r === rounds - 1;
          // Within the block: the next round's move. After the block: the next block's move, or
          // nothing after the final block (what follows comes from the next segment).
          const next = !lastRound ? moveAt(b, r + 1) : !lastBlock ? moveAt(b + 1, 0) : undefined;
          out.push({
            kind: "work",
            label: `${label} · block ${b + 1}`,
            durationSec: spec.workSec ?? 20,
            items: next ? [moveAt(b, r), next] : [moveAt(b, r)],
            round: r + 1,
            rounds,
            mode: "TABATA",
          });
          // A Tabata is 8 × (20 on, 10 off) = 4:00; the final 10 s rest runs into the block rest.
          if (!lastRound) out.push({ kind: "rest", label: "Rest", durationSec: spec.restSec ?? 10, items: [moveAt(b, r + 1)], round: r + 1, rounds });
        }
        if (!lastBlock) {
          const rest = (spec.restSec ?? 10) + (spec.blockRestSec ?? 60);
          out.push({ kind: "rest", label: "Block rest", durationSec: rest, items: [moveAt(b + 1, 0)] });
        }
      }
      return out;
    }
    case "INTERVAL": {
      const rounds = spec.rounds ?? 4;
      if (spec.intervalSec) {
        for (let r = 0; r < rounds; r++) {
          out.push({ kind: "work", label, durationSec: spec.intervalSec, items, round: r + 1, rounds, mode: "INTERVAL" });
        }
        return out;
      }
      for (let r = 0; r < rounds; r++) {
        out.push({ kind: "work", label: `Interval ${r + 1}`, durationSec: spec.workSec ?? 240, items, round: r + 1, rounds, mode: "INTERVAL", hrEntry: true });
        // The last recovery runs straight into the cool-down.
        if (r < rounds - 1) out.push({ kind: "rest", label: "Active recovery", durationSec: spec.restSec ?? 180, items, round: r + 1, rounds });
      }
      return out;
    }
    case "ROUNDS": {
      const rounds = spec.rounds ?? 5;
      for (let r = 0; r < rounds; r++) {
        out.push({ kind: "work", label: `${label} · round ${r + 1}`, durationSec: null, items, round: r + 1, rounds, mode: "ROUNDS" });
        if (r < rounds - 1 && spec.restSec) out.push({ kind: "rest", label: "Rest", durationSec: spec.restSec, items, round: r + 1, rounds });
      }
      return out;
    }
    case "STRAIGHT_SETS":
      return followAlong([{ label, items }]);
  }
}

/** One move at a time: holds are timed, reps wait for Next. Sets and sides repeat. */
export function followAlong(blocks: Pick<SessionBlock, "label" | "items" | "rounds">[]): Segment[] {
  const out: Segment[] = [];
  for (const b of blocks) {
    const rounds = b.rounds ?? 1;
    for (let r = 0; r < rounds; r++) {
      b.items.forEach((item, idx) => {
        const sets = item.sets ?? 1;
        for (let s = 0; s < sets; s++) {
          const next = b.items[idx + 1] ?? (r < rounds - 1 ? b.items[0] : undefined);
          const items = next ? [item, next] : [item];
          const label = rounds > 1 ? `${b.label} · round ${r + 1}` : b.label;
          if (item.seconds) {
            const sides = item.perSide ? 2 : 1;
            for (let side = 0; side < sides; side++) {
              // Side 1 previews side 2 of the same move.
              const preview = side < sides - 1 ? [item, item] : items;
              out.push({ kind: "work", label: sides > 1 ? `${label} · side ${side + 1}` : label, durationSec: item.seconds, items: preview, round: s + 1, rounds: sets });
            }
          } else {
            out.push({ kind: "work", label, durationSec: null, items, round: s + 1, rounds: sets });
          }
        }
      });
    }
  }
  return out;
}

/** Quick 20: prep 3:00 → work (15:00) → downshift 2:00. */
export function buildQuick20(t: SessionTemplate): Segment[] {
  const out: Segment[] = [];
  const [prep, ...rest] = t.blocks;
  const downshift = rest.pop();
  out.push({ kind: "prep", label: "Prep", durationSec: QUICK_PREP_SEC, items: prep?.items ?? [] });
  let prevTimed = false;
  for (const b of rest) {
    if (b.timer) {
      if (prevTimed) out.push({ kind: "rest", label: "Rest", durationSec: BETWEEN_TIMED_BLOCKS_SEC, items: b.items });
      out.push(...expandTimer(b.timer, b.items, b.label));
      prevTimed = true;
    } else {
      const sec = b.items.reduce((s, i) => s + itemSeconds(i), 0);
      out.push({ kind: "work", label: b.label, durationSec: sec || null, items: b.items });
      prevTimed = false;
    }
  }
  out.push({ kind: "downshift", label: "Downshift", durationSec: QUICK_DOWNSHIFT_SEC, items: downshift?.items ?? [] });
  return out;
}

/** The 4×4: warm-up, intervals (count from the progression stage), cool-down. */
export function build4x4(t: SessionTemplate, variant: "full" | "short", intervals?: number): Segment[] {
  const blocks = variant === "short" ? t.shortDay.blocks : t.blocks;
  const out: Segment[] = [];
  for (const b of blocks) {
    if (b.timer) {
      const rounds = variant === "full" && intervals ? intervals : b.timer.rounds;
      out.push(...expandTimer({ ...b.timer, rounds }, b.items, b.label));
    } else {
      const kind: SegmentKind = /warm/i.test(b.label) ? "warmup" : "cooldown";
      out.push({ kind, label: b.label, durationSec: b.items.reduce((s, i) => s + itemSeconds(i), 0) || null, items: b.items });
    }
  }
  return out;
}

export function programSeconds(segments: Segment[]): number {
  return segments.reduce((s, x) => s + (x.durationSec ?? 0), 0);
}

// ---------- Running ----------

export interface Run {
  segments: Segment[];
  /** Epoch ms. */
  startedAt: number;
  pauses: { at: number; resumedAt?: number }[];
  /** Segment index → active-time offset (ms) at which it was ended early or by Next. */
  advances: Record<number, number>;
  endedAt?: number;
  counters: { rounds: number; rungs: number; extraReps: number };
}

export function createRun(segments: Segment[], now: number): Run {
  return { segments, startedAt: now, pauses: [], advances: {}, counters: { rounds: 0, rungs: 0, extraReps: 0 } };
}

/** Milliseconds of active (unpaused) time since the start. */
export function activeMs(run: Run, now: number): number {
  const end = run.endedAt ?? now;
  let paused = 0;
  for (const p of run.pauses) paused += (p.resumedAt ?? end) - p.at;
  return Math.max(0, end - run.startedAt - paused);
}

export function isPaused(run: Run): boolean {
  const last = run.pauses[run.pauses.length - 1];
  return !!last && last.resumedAt === undefined;
}

export interface Position {
  index: number;
  segment: Segment | null;
  next: Segment | null;
  segElapsedMs: number;
  /** null for open-ended segments. */
  segRemainingMs: number | null;
  totalActiveMs: number;
  /** Remaining time in timed segments from here (open ones count as 0). */
  totalRemainingMs: number;
  done: boolean;
  paused: boolean;
}

export function position(run: Run, now: number): Position {
  const t = activeMs(run, now);
  let start = 0;
  const segs = run.segments;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const adv = run.advances[i];
    const natural = s.durationSec === null ? Infinity : start + s.durationSec * 1000;
    const end = adv !== undefined ? Math.min(adv, natural) : natural;
    if (t < end && !run.endedAt) {
      const rest = segs.slice(i + 1).reduce((acc, x) => acc + (x.durationSec ?? 0) * 1000, 0);
      const segRemaining = s.durationSec === null ? null : end - t;
      return {
        index: i,
        segment: s,
        next: segs[i + 1] ?? null,
        segElapsedMs: t - start,
        segRemainingMs: segRemaining,
        totalActiveMs: t,
        totalRemainingMs: (segRemaining ?? 0) + rest,
        done: false,
        paused: isPaused(run),
      };
    }
    start = end;
  }
  return {
    index: segs.length,
    segment: null,
    next: null,
    segElapsedMs: 0,
    segRemainingMs: 0,
    totalActiveMs: t,
    totalRemainingMs: 0,
    done: true,
    paused: false,
  };
}

export function pause(run: Run, now: number): Run {
  if (isPaused(run) || run.endedAt) return run;
  return { ...run, pauses: [...run.pauses, { at: now }] };
}

export function resume(run: Run, now: number): Run {
  if (!isPaused(run)) return run;
  const pauses = run.pauses.slice();
  pauses[pauses.length - 1] = { ...pauses[pauses.length - 1], resumedAt: now };
  return { ...run, pauses };
}

/** End the current segment now (Next / skip). */
export function advance(run: Run, now: number): Run {
  const p = position(run, now);
  if (p.done) return run;
  return { ...run, advances: { ...run.advances, [p.index]: p.totalActiveMs } };
}

export function endRun(run: Run, now: number): Run {
  if (run.endedAt) return run;
  const r = isPaused(run) ? resume(run, now) : run;
  return { ...r, endedAt: now };
}

/** Where the run stood when it was ended (or now): the position ignoring the end itself. */
export function finalPosition(run: Run, now: number): Position {
  return position({ ...run, endedAt: undefined }, run.endedAt ?? now);
}

/** Segments fully finished before the run ended. */
export function finishedSegments(run: Run, now: number): Segment[] {
  const p = finalPosition(run, now);
  return run.segments.slice(0, p.done ? run.segments.length : p.index);
}

/** True when End was tapped before the program ran out. */
export function endedEarly(run: Run): boolean {
  return !!run.endedAt && !finalPosition(run, run.endedAt).done;
}

export function bump(run: Run, key: keyof Run["counters"], by = 1): Run {
  return { ...run, counters: { ...run.counters, [key]: Math.max(0, run.counters[key] + by) } };
}

/** The score a Quick 20 saves: AMRAP rounds, LADDER top rung, or completed work segments. */
export function quickScore(run: Run): { rounds: number; rungs: number; extraReps: number } {
  return run.counters;
}

/** Cue events between two moments: segment changes and the last-3-second countdown. */
export type Cue = { type: "segment"; index: number } | { type: "tick"; secondsLeft: number } | { type: "done" };

export function cuesBetween(run: Run, from: number, to: number): Cue[] {
  if (to <= from) return [];
  const a = position(run, from);
  const b = position(run, to);
  const out: Cue[] = [];
  if (b.index !== a.index) {
    out.push(b.done ? { type: "done" } : { type: "segment", index: b.index });
    return out;
  }
  if (b.segRemainingMs !== null && a.segRemainingMs !== null) {
    const sa = Math.ceil(a.segRemainingMs / 1000);
    const sb = Math.ceil(b.segRemainingMs / 1000);
    if (sb < sa && sb <= 3 && sb >= 1) out.push({ type: "tick", secondsLeft: sb });
  }
  return out;
}
