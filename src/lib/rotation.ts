// The fixed weekly rotation (spec Part 5). Pure: no decisions for the user, just today's session.
import type { Rotation, SessionId, Weekday } from "./types";
import { addDays, daysBetween, weekdayOf } from "./time";

export const WEEKDAYS: Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Monday of the week containing `key`. */
export function mondayOf(key: string): string {
  const wd = weekdayOf(key); // 0 = Sun
  return addDays(key, wd === 0 ? -6 : 1 - wd);
}

export interface WeekInfo {
  /** 1-based week since the rotation start (before the start: week 1). */
  week: number;
  /** 1…deloadEvery */
  cycleWeek: number;
  deload: boolean;
}

export function weekInfo(rotation: Pick<Rotation, "startDate" | "deloadEvery">, today: string): WeekInfo {
  const diff = Math.max(0, daysBetween(mondayOf(rotation.startDate), mondayOf(today)));
  const week = Math.floor(diff / 7) + 1;
  const cycleWeek = ((week - 1) % rotation.deloadEvery) + 1;
  return { week, cycleWeek, deload: cycleWeek === rotation.deloadEvery };
}

/** The Quick 20 for a given cycle week: Q1 in week 1 … Q6 (the deload Q) in week 6. */
export function quickForWeek(rotation: Pick<Rotation, "quickCycle">, cycleWeek: number): SessionId {
  const c = rotation.quickCycle;
  return c[(cycleWeek - 1) % c.length];
}

export function nextQuick(rotation: Pick<Rotation, "quickCycle">, id: SessionId): SessionId {
  const c = rotation.quickCycle;
  const i = c.indexOf(id);
  return c[(i + 1) % c.length];
}

export interface TodayPlan {
  date: string;
  weekday: Weekday;
  sessionId: SessionId | "REST";
  /** Sunday's optional session. */
  optional?: SessionId;
  /** Saturday's alternative (a 2nd Quick 20 = the next one in the cycle). */
  alternative?: SessionId;
  reason?: string;
  week: WeekInfo;
}

/**
 * Today's session. A missed day is skipped, never doubled; the one exception is a missed
 * Wednesday 4×4, which moves to Saturday in place of Z.
 */
export function planForDay(
  rotation: Rotation,
  today: string,
  didSession: (date: string, id: SessionId) => boolean = () => false,
): TodayPlan {
  const weekday = WEEKDAYS[weekdayOf(today)];
  const week = weekInfo(rotation, today);
  const slot = rotation.weekdayMap[weekday];
  const quick = quickForWeek(rotation, week.cycleWeek);
  const base: Omit<TodayPlan, "sessionId"> = { date: today, weekday, week };

  if (slot === "REST") return { ...base, sessionId: "REST", optional: "DAILY10" };
  if (slot === "Q*") return { ...base, sessionId: quick };

  if (weekday === "sat" && slot === "Z") {
    const wed = addDays(today, -3);
    const wedIsC = rotation.weekdayMap.wed === "C";
    const started = daysBetween(rotation.startDate, wed) >= 0;
    if (wedIsC && started && !didSession(wed, "C")) {
      return { ...base, sessionId: "C", alternative: "Z", reason: "Wednesday's 4×4 was missed, so it moves to today." };
    }
    return { ...base, sessionId: "Z", alternative: nextQuick(rotation, quick) };
  }
  return { ...base, sessionId: slot as SessionId };
}
