"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { create, nowIso, update } from "@/db/records";
import { applyResult, initialState, LADDERS, ladderKey, parseRange, resultsFromLog } from "@/lib/progression";
import { quickForWeek, nextQuick } from "@/lib/rotation";
import { plannedSets } from "@/lib/session";
import type { Run } from "@/lib/timer";
import type { ProgressionState, SessionBlock, SessionId, WorkoutLog } from "@/lib/types";
import { defaultRotation, exerciseById } from "@/seed";
import { getSettings } from "./settings";

export function useWorkoutLogs(): WorkoutLog[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db().workoutLogs.orderBy("startedAt").reverse().toArray();
    return rows.filter((r) => !r.deletedAt);
  }, []);
}

export function useLastLog(templateId: SessionId | undefined): WorkoutLog | null | undefined {
  return useLiveQuery(async () => {
    if (!templateId) return null;
    const rows = await db().workoutLogs.where("templateId").equals(templateId).toArray();
    return rows.filter((r) => !r.deletedAt && r.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  }, [templateId]);
}

export function useProgression(): Map<string, ProgressionState> | undefined {
  return useLiveQuery(async () => {
    const rows = await db().progression.toArray();
    return new Map(rows.filter((r) => !r.deletedAt).map((r) => [r.exerciseId, r]));
  }, []);
}

/** Weights that exist for this exercise: bells for kettlebell moves, dumbbells for dumbbell moves. */
function gearFor(exerciseId: string, bells: number[], dumbbells: number[]): number[] {
  const eq = exerciseById.get(exerciseId)?.equipment;
  if (eq === "kettlebell") return bells;
  if (eq === "dumbbell") return dumbbells;
  return [...bells, ...dumbbells];
}

const saving = new Map<string, Promise<{ log: WorkoutLog; messages: string[] }>>();

/**
 * Save a finished session and move progression on. Returns any "next stage" messages.
 * Idempotent per session (template + start time), so a double tap on Save saves once.
 * `progressSets` limits which sets count toward progression (the full log is always saved).
 */
export function saveWorkout(
  log: Omit<WorkoutLog, "id" | "createdAt" | "updatedAt">,
  blocks: SessionBlock[],
  opts: { progress: boolean; progressSets?: (s: WorkoutLog["sets"][number]) => boolean } = { progress: true },
): Promise<{ log: WorkoutLog; messages: string[] }> {
  const key = `${log.templateId}|${log.startedAt}`;
  const inFlight = saving.get(key);
  if (inFlight) return inFlight;
  const p = doSave(log, blocks, opts);
  saving.set(key, p);
  return p;
}

async function doSave(
  log: Omit<WorkoutLog, "id" | "createdAt" | "updatedAt">,
  blocks: SessionBlock[],
  opts: { progress: boolean; progressSets?: (s: WorkoutLog["sets"][number]) => boolean },
): Promise<{ log: WorkoutLog; messages: string[] }> {
  const already = (await db().workoutLogs.where("templateId").equals(log.templateId).toArray()).find(
    (l) => l.startedAt === log.startedAt && !l.deletedAt,
  );
  if (already) return { log: already, messages: [] };
  const saved = await create(db().workoutLogs, log);
  const messages: string[] = [];
  if (!opts.progress) return { log: saved, messages };
  const settings = await getSettings();
  const planned = new Map<string, number>();
  for (const [id, n] of plannedSets(blocks)) {
    const key = ladderKey(id) ?? id;
    planned.set(key, (planned.get(key) ?? 0) + n);
  }
  const items = new Map(blocks.flatMap((b) => b.items).map((i) => [ladderKey(i.exerciseId) ?? i.exerciseId, i]));
  const counted = opts.progressSets ? { ...saved, sets: saved.sets.filter(opts.progressSets) } : saved;
  for (const [key, result] of resultsFromLog(counted, planned)) {
    const item = items.get(key);
    const range = parseRange(item?.reps);
    if (!LADDERS[key] && !range) continue;
    const existing = await db().progression.where("exerciseId").equals(key).first();
    const prev = existing ?? { ...initialState(key, item), currentLoadLb: result.sets.find((s) => s.loadLb)?.loadLb ?? item?.loadLb ?? 0 };
    const gear = gearFor(item?.exerciseId ?? key, settings.bellsLb, settings.dumbbellsLb);
    const u = applyResult(key, prev, result, gear, range);
    if (existing) await update(db().progression, existing.id, u.next);
    else await create(db().progression, u.next);
    if (u.message) messages.push(u.message);
  }
  return { log: saved, messages };
}

// ---------- Swaps (remembered per session, so there's nothing to re-decide next time) ----------

export function useSwaps(templateId: SessionId): Record<string, string> {
  return (
    useLiveQuery(async () => ((await db().kv.get(`swaps:${templateId}`))?.value as Record<string, string>) ?? {}, [templateId]) ?? {}
  );
}

export async function setSwap(templateId: SessionId, from: string, to: string | null): Promise<void> {
  const key = `swaps:${templateId}`;
  const cur = ((await db().kv.get(key))?.value as Record<string, string>) ?? {};
  const next = { ...cur };
  if (to && to !== from) next[from] = to;
  else delete next[from];
  await db().kv.put({ key, value: next, updatedAt: nowIso() });
}

// ---------- Resumable timer runs ----------

export interface ActiveRun {
  kind: "quick" | "4x4" | "follow";
  templateId: SessionId;
  variant: "full" | "short" | "easy";
  run: Run;
  mode?: string;
  hr?: { peak: number; avg: number }[];
  /** Started on a deload day: nothing moves a stage. */
  deload?: boolean;
  /** 4×4 work target as a share of HRmax, from the stage. */
  workPct?: [number, number];
}

const RUN_KEY = "run:active";

export function useActiveRun(): ActiveRun | null | undefined {
  return useLiveQuery(async () => ((await db().kv.get(RUN_KEY))?.value as ActiveRun) ?? null, []);
}

export async function saveRun(r: ActiveRun | null): Promise<void> {
  if (r) await db().kv.put({ key: RUN_KEY, value: r, updatedAt: nowIso() });
  else await db().kv.delete(RUN_KEY);
}

/** Change the stored run atomically, so quick taps (+1, +1) never overwrite each other. */
export async function mutateRun(fn: (r: ActiveRun) => ActiveRun): Promise<void> {
  await mutateKv<ActiveRun>(RUN_KEY, fn);
}

async function mutateKv<T>(key: string, fn: (v: T) => T): Promise<void> {
  const d = db();
  await d.transaction("rw", d.kv, async () => {
    const cur = (await d.kv.get(key))?.value as T | undefined;
    if (cur === undefined) return;
    await d.kv.put({ key, value: fn(cur), updatedAt: nowIso() });
  });
}

// ---------- Logger drafts ----------

export interface Draft {
  templateId: SessionId;
  variant: "full" | "short" | "easy";
  deload: boolean;
  startedAt: string;
  /** The plan as it was when the session started (swaps and stages locked in). */
  blocks: SessionBlock[];
  sets: WorkoutLog["sets"];
  rest?: { until: number; total: number; beeped?: boolean };
}

const DRAFT_KEY = "draft:active";

export function useDraft(): Draft | null | undefined {
  return useLiveQuery(async () => ((await db().kv.get(DRAFT_KEY))?.value as Draft) ?? null, []);
}

export async function saveDraft(d: Draft | null): Promise<void> {
  if (d) await db().kv.put({ key: DRAFT_KEY, value: d, updatedAt: nowIso() });
  else await db().kv.delete(DRAFT_KEY);
}

/** Change the stored draft atomically (several set taps in a row each see the latest draft). */
export async function mutateDraft(fn: (d: Draft) => Draft): Promise<void> {
  await mutateKv<Draft>(DRAFT_KEY, fn);
}

// ---------- Quick 20 default ----------

/** The picker defaults to the next Quick 20 in the cycle: after the last one done, else this week's. */
/** Q5 is the hardest Quick 20: skipped on deloads (Q6 instead). */
export function deloadSafeQuick(id: SessionId, deload: boolean): SessionId {
  return deload && id === "Q5" ? "Q6" : id;
}

export function defaultQuick(logs: WorkoutLog[], cycleWeek: number, deload: boolean): SessionId {
  const cycle = defaultRotation.quickCycle;
  const last = logs.find((l) => cycle.includes(l.templateId));
  const q = last ? nextQuick(defaultRotation, last.templateId) : quickForWeek(defaultRotation, cycleWeek);
  // On any deload day the Quick 20 is Q6, the S&S deload (so Q5 is never offered).
  return deload ? "Q6" : q;
}
