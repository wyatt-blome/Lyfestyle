"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { create, softDelete } from "@/db/records";
import type { BodyMetric, WorkoutLog } from "@/lib/types";

export type MetricInput = Omit<BodyMetric, "id" | "createdAt" | "updatedAt" | "deletedAt">;

/** Plausible ranges, so a typo (2000 lb) is caught before it wrecks a chart. */
const RANGES: Record<Exclude<keyof MetricInput, "at">, [number, number, string]> = {
  weightLb: [50, 700, "Weight"],
  waistIn: [15, 80, "Waist"],
  restingHr: [25, 150, "Resting HR"],
  bpSys: [60, 260, "Systolic BP"],
  bpDia: [30, 160, "Diastolic BP"],
};

export function validateMetric(m: MetricInput): string | null {
  if (Number.isNaN(Date.parse(m.at))) return "Time is not valid.";
  if (Date.parse(m.at) > Date.now() + 60_000) return "Time can't be in the future.";
  let any = false;
  for (const [k, [lo, hi, label]] of Object.entries(RANGES)) {
    const v = m[k as keyof typeof RANGES];
    if (v === undefined) continue;
    any = true;
    if (!Number.isFinite(v) || v < lo || v > hi) return `${label} should be between ${lo} and ${hi}.`;
  }
  if (!any) return "Enter at least one measurement.";
  if ((m.bpSys === undefined) !== (m.bpDia === undefined)) return "Enter both blood-pressure numbers.";
  return null;
}

export async function addMetric(m: MetricInput): Promise<BodyMetric> {
  const err = validateMetric(m);
  if (err) throw new Error(err);
  return create(db().bodyMetrics, m);
}

export async function deleteMetric(id: string): Promise<void> {
  await softDelete(db().bodyMetrics, id);
}

/** Body metrics, newest first. */
export function useMetrics(): BodyMetric[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db().bodyMetrics.orderBy("at").reverse().toArray();
    return rows.filter((r) => !r.deletedAt);
  }, []);
}

/** Workout logs for charts (read-only here; the Train screens write them). */
export function useWorkoutLogs(): WorkoutLog[] | undefined {
  return useLiveQuery(async () => (await db().workoutLogs.toArray()).filter((r) => !r.deletedAt), []);
}
