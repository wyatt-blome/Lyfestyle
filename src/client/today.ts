"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { planForDay, type TodayPlan } from "@/lib/rotation";
import { dateKey } from "@/lib/time";
import type { Settings } from "@/lib/types";
import { defaultRotation } from "@/seed";

/** Today's planned session from the fixed rotation. */
export function useTodayPlan(settings: Settings | undefined, now: number): TodayPlan | undefined {
  const today = dateKey(now, settings?.tz);
  const done = useLiveQuery(async () => {
    const rows = await db().workoutLogs.toArray();
    return new Set(rows.filter((r) => !r.deletedAt).map((r) => `${r.date}|${r.templateId}`));
  }, []);
  if (!settings || !done) return undefined;
  return planForDay({ ...defaultRotation, startDate: settings.rotationStartDate }, today, (d, id) =>
    done.has(`${d}|${id}`),
  );
}
