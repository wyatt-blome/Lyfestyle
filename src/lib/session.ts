// Session shaping (spec Part 5): variants, deload scaling, heart-rate zones, deload triggers. Pure.
import type { Fast, SessionBlock, SessionId, SessionItem, SessionTemplate } from "./types";
import { HOUR_MS } from "./time";
import { elapsedMs } from "./fasting";

export type Variant = "full" | "short" | "easy";

export const DELOAD_SET_SHARE = 0.6;

function scale(n: number | undefined): number | undefined {
  return n === undefined ? undefined : Math.max(1, Math.round(n * DELOAD_SET_SHARE));
}

/** The blocks to do today: full or short, with ~60% of the sets on a deload. */
export function sessionBlocks(t: SessionTemplate, variant: Variant, deload: boolean): SessionBlock[] {
  const blocks = variant === "short" ? t.shortDay.blocks : t.blocks;
  // Quick 20s are timed formats: a deload day runs Q6 (the deload Q) instead of shrinking one.
  if (!deload || t.type === "mobility" || t.type === "zone2" || t.type === "quick20") return blocks;
  return blocks.map((b) => ({
    ...b,
    rounds: scale(b.rounds),
    items: b.items.map((i) => ({ ...i, sets: scale(i.sets) })),
  }));
}

const CARRIES = ["kb-suitcase-carry", "kb-suitcase-march", "farmer-carry", "kb-rack-carry", "kb-bottoms-up-carry"];

/** Heavy carries (40 lb) are off during a fast past 24 h (spec: hide heavy carries). */
export function isHeavyCarry(i: SessionItem): boolean {
  return CARRIES.includes(i.exerciseId) && (i.loadLb ?? 0) >= 40;
}

export function withoutHeavyCarries(blocks: SessionBlock[]): SessionBlock[] {
  return blocks.map((b) => ({ ...b, items: b.items.filter((i) => !isHeavyCarry(i)) })).filter((b) => b.items.length > 0);
}

/** Apply this session's swaps (exerciseId → chosen replacement). */
export function applySwaps(blocks: SessionBlock[], swaps: Record<string, string>): SessionBlock[] {
  return blocks.map((b) => ({
    ...b,
    items: b.items.map((i) => (swaps[i.exerciseId] ? { ...i, exerciseId: swaps[i.exerciseId] } : i)),
  }));
}

/** Total working sets per exercise in the plan (for "did you do them all"). */
export function plannedSets(blocks: SessionBlock[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of blocks) for (const i of b.items) out.set(i.exerciseId, (out.get(i.exerciseId) ?? 0) + (b.rounds ?? 1) * (i.sets ?? 1));
  return out;
}

/** "3 × 8/side · 40 lb · rest 60 s" */
export function describeItem(i: SessionItem, rounds?: number, restSec?: number): string {
  const parts: string[] = [];
  const sets = (rounds ?? 1) * (i.sets ?? 1);
  const side = i.perSide ? "/side" : "";
  let dose = "";
  if (i.reps !== undefined) dose = `${i.reps}${side}`;
  else if (i.meters !== undefined) dose = `${i.meters} m${side}`;
  else if (i.seconds !== undefined) dose = i.seconds >= 120 ? `${Math.round(i.seconds / 60)} min${side}` : `${i.seconds} s${side}`;
  if (dose) parts.push(sets > 1 ? `${sets} × ${dose}` : dose);
  else if (sets > 1) parts.push(`${sets} sets`);
  if (i.loadLb) parts.push(`${i.loadLb} lb`);
  const rest = i.restSec ?? restSec;
  if (rest) parts.push(`rest ${rest} s`);
  return parts.join(" · ");
}

// ---------- Heart rate ----------

export function hrMax(age: number): number {
  return Math.round(211 - 0.64 * age);
}

export interface Zones {
  max: number;
  warmup: [number, number];
  work: [number, number];
  recovery: number;
  zone2: [number, number];
}

export function zones(age: number): Zones {
  const m = hrMax(age);
  const pct = (p: number) => Math.round(m * p);
  return { max: m, warmup: [pct(0.6), pct(0.7)], work: [pct(0.85), pct(0.95)], recovery: pct(0.7), zone2: [pct(0.6), pct(0.7)] };
}

export const TALK_TEST = {
  work: "2–3 words, not a sentence",
  recovery: "Easy, catch your breath",
  zone2: "Full sentences, mostly nose breathing",
};

export const FOURBYFOUR_MODES = [
  { id: "interval-hill", label: "Hill", note: "Uphill hike or march (default for the ranch)" },
  { id: "interval-bike", label: "Bike / Rower", note: "Steady hard pace" },
  {
    id: "interval-bell-step",
    label: "Bell & Step",
    note: "Continuous cycles of 10 two-hand swings (40 lb) + 6/6 bench step-ups; if grip fades, step-ups only",
  },
  { id: "interval-hill", label: "Outdoor chores", note: "Uphill chores at work pace", key: "chores" },
] as const;

// ---------- Deload and easy days ----------

export interface DeloadInput {
  deloadWeek: boolean;
  readinessScore?: number;
  /** Fasts that ended (or are running) in the last 48 h. */
  recentFasts: Fast[];
  now: number;
  /** Manual: illness or < 6 h sleep two nights running. */
  manual?: boolean;
}

export function deloadReasons(d: DeloadInput): string[] {
  const out: string[] = [];
  if (d.deloadWeek) out.push("Deload week (every 6th week)");
  if (d.readinessScore !== undefined && d.readinessScore <= 2) out.push("Readiness ≤ 2");
  const longFast = d.recentFasts.some((f) => {
    const end = f.endAt ? Date.parse(f.endAt) : d.now;
    return !f.deletedAt && d.now - end < 48 * HOUR_MS && elapsedMs(f, d.now) >= 36 * HOUR_MS;
  });
  if (longFast) out.push("A ≥ 36 h fast in the last 2 days");
  if (d.manual) out.push("Illness or < 6 h sleep two nights running");
  return out;
}

export const EASY_OPTIONS: SessionId[] = ["M", "Z", "DAILY10"];

/** Easy Day default: M, unless today already is M (then Z). */
export function defaultEasy(planned: SessionId | "REST"): SessionId {
  return planned === "M" ? "Z" : "M";
}

/** Timing note for hard sessions vs the current fast (spec: OMAD → before the meal). */
export function fastTimingNote(fast: Fast | null | undefined, hard: boolean): string | null {
  if (!hard || !fast || fast.status !== "active") return null;
  if (fast.protocol === "OMAD") return "OMAD day: do hard sessions before the meal.";
  if (fast.targetHours <= 20) return "Hard sessions go late in the fast or inside the eating window.";
  return null;
}
