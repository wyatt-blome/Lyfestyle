// Progress math (Phase 3): readiness, chart series and the weekly summary. Pure: inputs are stored
// records plus `now` and the zone; every day is a local YYYY-MM-DD key.
import { dailyHours, elapsedMs, hitTarget } from "./fasting";
import type { BodyMetric, Fast, Readiness, WorkoutLog } from "./types";
import { HOUR_MS, addDays, dateKey, weekdayOf } from "./time";

// ---------- Readiness ----------

type ReadinessScores = Pick<Readiness, "sleep" | "soreness" | "energy">;

/** Average of sleep, soreness and energy (each 1–5, higher is better; soreness 5 = fresh). */
export function readinessScore(r: ReadinessScores): number {
  return (r.sleep + r.soreness + r.energy) / 3;
}

/** A score of 2 or lower suggests an Easy Day (M, Z or Daily 10). */
export function suggestsEasyDay(r: ReadinessScores): boolean {
  return readinessScore(r) <= 2;
}

export function isScore(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 5;
}

// ---------- Weeks ----------

/** Monday of the week containing `key` (weeks run Monday to Sunday). */
export function mondayOf(key: string): string {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

/** ISO 8601 week label like "2026-W42". */
export function isoWeek(key: string): string {
  const thursday = addDays(mondayOf(key), 3);
  const year = Number(thursday.slice(0, 4));
  const jan4Monday = mondayOf(`${year}-01-04`);
  const [ty, tm, td] = thursday.split("-").map(Number);
  const [jy, jm, jd] = jan4Monday.split("-").map(Number);
  const week = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(jy, jm - 1, jd)) / (7 * 86_400_000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function alive<T extends { deletedAt?: string }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}

/** A session counts as done when it was finished or has at least one set ticked. */
export function sessionDone(l: WorkoutLog): boolean {
  return !l.deletedAt && (!!l.endedAt || l.sets.some((s) => s.done));
}

// ---------- Chart series ----------

export interface DayPoint {
  date: string;
  value: number;
}

/** Longest fast per local day (by end day) for the last `days` days, oldest first. 0 = no fast. */
export function fastingHoursSeries(fasts: Fast[], now: number, tz: string, days = 30): (DayPoint & { hit: boolean })[] {
  const map = dailyHours(fasts, tz);
  const today = dateKey(now, tz);
  const out: (DayPoint & { hit: boolean })[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const d = map.get(date);
    out.push({ date, value: d ? Math.round(d.hours * 10) / 10 : 0, hit: d?.hit ?? false });
  }
  return out;
}

/** Done sessions per Monday-to-Sunday week, last `weeks` weeks, oldest first (date = Monday). */
export function sessionsPerWeek(logs: WorkoutLog[], now: number, tz: string, weeks = 12): DayPoint[] {
  const thisMonday = mondayOf(dateKey(now, tz));
  const out: DayPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ date: addDays(thisMonday, -7 * i), value: 0 });
  const index = new Map(out.map((p, i) => [p.date, i]));
  for (const l of logs) {
    if (!sessionDone(l)) continue;
    const i = index.get(mondayOf(l.date));
    if (i !== undefined) out[i].value++;
  }
  return out;
}

/** Exercises with at least one logged load, most-logged first. */
export function loggedLifts(logs: WorkoutLog[]): { exerciseId: string; sessions: number }[] {
  const counts = new Map<string, Set<string>>();
  for (const l of alive(logs)) {
    for (const s of l.sets) {
      if (s.loadLb === undefined || s.loadLb <= 0) continue;
      if (!counts.has(s.exerciseId)) counts.set(s.exerciseId, new Set());
      counts.get(s.exerciseId)!.add(l.id);
    }
  }
  return [...counts.entries()]
    .map(([exerciseId, ids]) => ({ exerciseId, sessions: ids.size }))
    .sort((a, b) => b.sessions - a.sessions || a.exerciseId.localeCompare(b.exerciseId));
}

/** Heaviest load per session date for one exercise, oldest first. */
export function liftSeries(logs: WorkoutLog[], exerciseId: string): DayPoint[] {
  const byDate = new Map<string, number>();
  for (const l of alive(logs)) {
    for (const s of l.sets) {
      if (s.exerciseId !== exerciseId || s.loadLb === undefined || s.loadLb <= 0) continue;
      byDate.set(l.date, Math.max(byDate.get(l.date) ?? 0, s.loadLb));
    }
  }
  return [...byDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

export interface QuickSeries {
  templateId: string;
  /** Rounds for AMRAP-style templates, rungs for ladders: whichever this template records. */
  metric: "rounds" | "rungs";
  points: DayPoint[];
}

/** Quick 20 scores (Q-templates with a `quick` result), one series per template. */
export function quickScores(logs: WorkoutLog[]): QuickSeries[] {
  const groups = new Map<string, WorkoutLog[]>();
  for (const l of alive(logs)) {
    if (!l.templateId.startsWith("Q") || !l.quick) continue;
    if (!groups.has(l.templateId)) groups.set(l.templateId, []);
    groups.get(l.templateId)!.push(l);
  }
  return [...groups.entries()]
    .map(([templateId, rows]) => {
      const rounds = rows.reduce((s, r) => s + (r.quick!.rounds || 0), 0);
      const rungs = rows.reduce((s, r) => s + (r.quick!.rungs || 0), 0);
      const metric: QuickSeries["metric"] = rungs > rounds ? "rungs" : "rounds";
      const points = rows
        .map((r) => ({ date: r.date, value: r.quick![metric] || 0 }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return { templateId, metric, points };
    })
    .sort((a, b) => a.templateId.localeCompare(b.templateId, undefined, { numeric: true }));
}

/** 4×4 heart rate per session: highest interval peak and mean interval average. */
export function hrSeries(logs: WorkoutLog[]): { date: string; peak: number; avg: number }[] {
  return alive(logs)
    .filter((l) => (l.hr?.intervals.length ?? 0) > 0)
    .map((l) => {
      const iv = l.hr!.intervals;
      return {
        date: l.date,
        peak: Math.max(...iv.map((i) => i.peak)),
        avg: Math.round(iv.reduce((s, i) => s + i.avg, 0) / iv.length),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type MetricField = "weightLb" | "waistIn" | "restingHr";

/** One body metric over time (oldest first), one point per day: the day's last reading. */
export function metricSeries(metrics: BodyMetric[], field: MetricField, tz: string): DayPoint[] {
  const byDay = new Map<string, number>();
  for (const m of alive(metrics)
    .filter((m) => typeof m[field] === "number")
    .sort((a, b) => a.at.localeCompare(b.at))) {
    byDay.set(dateKey(m.at, tz), m[field]!);
  }
  return [...byDay.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Weekly summary ----------

export interface WeekStats {
  monday: string;
  fastsEnded: number;
  fastsCompleted: number;
  hitRate: number;
  avgHours: number;
  sessions: number;
  avgReadiness?: number;
  /** Last weight this week minus the last weight before the week; undefined without both. */
  weightChange?: number;
}

export function weekStats(
  monday: string,
  data: { fasts: Fast[]; logs: WorkoutLog[]; readiness: Readiness[]; metrics: BodyMetric[] },
  tz: string,
): WeekStats {
  const sunday = addDays(monday, 6);
  const inWeek = (key: string) => key >= monday && key <= sunday;
  const ended = alive(data.fasts).filter((f) => f.endAt && f.status !== "active" && inWeek(dateKey(f.endAt, tz)));
  const completed = ended.filter(hitTarget);
  const hours = ended.reduce((s, f) => s + elapsedMs(f, 0), 0) / HOUR_MS;
  const ready = alive(data.readiness).filter((r) => inWeek(r.date));
  const weights = alive(data.metrics)
    .filter((m) => typeof m.weightLb === "number")
    .sort((a, b) => a.at.localeCompare(b.at));
  const lastIn = [...weights].reverse().find((m) => inWeek(dateKey(m.at, tz)));
  const lastBefore = [...weights].reverse().find((m) => dateKey(m.at, tz) < monday);
  return {
    monday,
    fastsEnded: ended.length,
    fastsCompleted: completed.length,
    hitRate: ended.length ? completed.length / ended.length : 0,
    avgHours: ended.length ? hours / ended.length : 0,
    sessions: data.logs.filter((l) => sessionDone(l) && inWeek(l.date)).length,
    avgReadiness: ready.length ? ready.reduce((s, r) => s + readinessScore(r), 0) / ready.length : undefined,
    weightChange:
      lastIn && lastBefore ? Math.round((lastIn.weightLb! - lastBefore.weightLb!) * 10) / 10 : undefined,
  };
}

/** This week and last week (Monday to Sunday in the given zone). */
export function weeklySummary(
  data: { fasts: Fast[]; logs: WorkoutLog[]; readiness: Readiness[]; metrics: BodyMetric[] },
  now: number,
  tz: string,
): { thisWeek: WeekStats; lastWeek: WeekStats } {
  const monday = mondayOf(dateKey(now, tz));
  return { thisWeek: weekStats(monday, data, tz), lastWeek: weekStats(addDays(monday, -7), data, tz) };
}
