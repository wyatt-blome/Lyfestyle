"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { create, update } from "@/db/records";
import { isScore } from "@/lib/progress";
import { dateKey } from "@/lib/time";
import type { Readiness } from "@/lib/types";
import { useSettings } from "./settings";
import { useNow } from "./useNow";

type Scores = Pick<Readiness, "sleep" | "soreness" | "energy">;

/** Save the check-in for a day (YYYY-MM-DD), replacing that day's earlier one. */
export async function saveReadiness(date: string, scores: Scores): Promise<void> {
  if (![scores.sleep, scores.soreness, scores.energy].every(isScore)) throw new Error("Pick 1–5 for each.");
  const existing = await db().readiness.where("date").equals(date).first();
  if (existing) {
    // The date index is unique, so a deleted row is revived rather than duplicated.
    await update(db().readiness, existing.id, { ...scores, deletedAt: undefined });
  } else {
    await create(db().readiness, { date, ...scores });
  }
}

export function useReadinessFor(date: string): Readiness | null | undefined {
  return useLiveQuery(async () => {
    const r = await db().readiness.where("date").equals(date).first();
    return r && !r.deletedAt ? r : null;
  }, [date]);
}

/** Today's check-in in the device zone: undefined while loading, null when not filled in. */
export function useTodayReadiness(): Readiness | null | undefined {
  const settings = useSettings();
  const now = useNow(60_000);
  return useReadinessFor(dateKey(now, settings?.tz));
}

export function useAllReadiness(): Readiness[] | undefined {
  return useLiveQuery(async () => (await db().readiness.toArray()).filter((r) => !r.deletedAt), []);
}
