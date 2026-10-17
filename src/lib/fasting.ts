// Fasting rules (spec Part 3). Pure: every time is derived from stored timestamps and `now`.
import type { Fast, ProtocolId, SessionId } from "./types";
import {
  HOUR_MS,
  MIN_MS,
  addDays,
  dateKey,
  daysBetween,
  deviceTz,
  formatDayTime,
  fromLocalInput,
  toLocalInput,
} from "./time";

export interface ProtocolDef {
  id: ProtocolId;
  label: string;
  targetHours: number;
  /** Eating window after the fast, for daily protocols. */
  windowHours?: number;
  note: string;
}

export const PROTOCOLS: ProtocolDef[] = [
  { id: "13:11", label: "13:11", targetHours: 13, windowHours: 11, note: "Gentle start" },
  { id: "16:8", label: "16:8", targetHours: 16, windowHours: 8, note: "Default daily base" },
  { id: "18:6", label: "18:6", targetHours: 18, windowHours: 6, note: "2–4×/week once 16:8 is easy" },
  { id: "20:4", label: "20:4", targetHours: 20, windowHours: 4, note: "Occasional longer day" },
  { id: "OMAD", label: "OMAD", targetHours: 23, windowHours: 1, note: "Optional, max 1–2×/week" },
  { id: "24h", label: "24 h", targetHours: 24, note: "Every 1–4 weeks, on an M or Z day" },
  { id: "36h", label: "36 h", targetHours: 36, note: "Extended: doctor first" },
  { id: "48h", label: "48 h", targetHours: 48, note: "Extended: doctor first" },
  { id: "custom", label: "Custom", targetHours: 16, note: "Pick your own hours" },
];

export const DEFAULT_PROTOCOL: ProtocolId = "16:8";

export function protocolDef(id: ProtocolId): ProtocolDef {
  return PROTOCOLS.find((p) => p.id === id) ?? PROTOCOLS[1];
}

export function targetHoursFor(id: ProtocolId, customHours?: number): number {
  if (id === "custom") return clampHours(customHours ?? 16);
  return protocolDef(id).targetHours;
}

function clampHours(h: number): number {
  if (!Number.isFinite(h)) return 16;
  return Math.min(120, Math.max(1, Math.round(h * 4) / 4));
}

/** Lenient custom-hours input: "16", "16.5", "16,5", "36 h", "20 hours". Null when unparseable. */
export function parseHours(input: string): number | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hour|hours)?$/i.exec(input.trim());
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------- Safety ----------

/** Fasts over 24 h need the doctor acknowledgement ticked. */
export function requiresDoctorAck(targetHours: number): boolean {
  return targetHours > 24;
}

/** 36 h+ show the electrolytes reminder and stop-if-dizzy warning. */
export function isExtended(targetHours: number): boolean {
  return targetHours >= 36;
}

export function canStart(targetHours: number, doctorAck: boolean): { ok: boolean; reason?: string } {
  if (requiresDoctorAck(targetHours) && !doctorAck) {
    return { ok: false, reason: "Fasts over 24 h need the doctor note ticked first." };
  }
  return { ok: true };
}

export const DISCLAIMER =
  "Not medical advice. Check with your doctor before fasts over 24 h or hard intervals if you have heart, blood-pressure or blood-sugar issues.";

export const EXTENDED_WARNING =
  "Stop the fast if you feel dizzy, faint or have palpitations. Take electrolytes, rest, and break a long fast gently with a small protein meal.";

/**
 * Training restriction during a long fast: once an active fast is past 24 h (or was started with a
 * target over 24 h), only the easy options show.
 */
export function longFastActive(fast: Fast | undefined, now: number): boolean {
  if (!fast || fast.status !== "active") return false;
  return elapsedMs(fast, now) > 24 * HOUR_MS || fast.targetHours > 24;
}

export const EASY_SESSIONS: SessionId[] = ["M", "Z", "DAILY10"];

export function allowedDuringLongFast(id: SessionId): boolean {
  return EASY_SESSIONS.includes(id);
}

// ---------- Progress ----------

export function elapsedMs(fast: Pick<Fast, "startAt" | "endAt">, now: number): number {
  const end = fast.endAt ? Date.parse(fast.endAt) : now;
  return Math.max(0, end - Date.parse(fast.startAt));
}

export interface FastProgress {
  elapsedMs: number;
  remainingMs: number;
  targetMs: number;
  fraction: number;
  projectedEnd: number;
  reached: boolean;
}

export function progress(fast: Fast, now: number): FastProgress {
  const targetMs = fast.targetHours * HOUR_MS;
  const el = elapsedMs(fast, now);
  return {
    elapsedMs: el,
    remainingMs: Math.max(0, targetMs - el),
    targetMs,
    fraction: targetMs > 0 ? Math.min(1, el / targetMs) : 0,
    projectedEnd: Date.parse(fast.startAt) + targetMs,
    reached: el >= targetMs,
  };
}

export interface Stage {
  fromH: number;
  toH: number;
  label: string;
  extended?: boolean;
}

/** Approximate, varies by person. No guest attribution. */
export const STAGES: Stage[] = [
  { fromH: 0, toH: 4, label: "Fed" },
  { fromH: 4, toH: 12, label: "Insulin falling" },
  { fromH: 12, toH: 18, label: "Glycogen falling, fat use rising" },
  { fromH: 18, toH: 24, label: "Ketones rising" },
  { fromH: 24, toH: 48, label: "Deeper ketosis", extended: true },
];

export const STAGE_CAVEAT = "Approximate, varies by person.";

export function stageIndexAt(hours: number): number {
  for (let i = STAGES.length - 1; i >= 0; i--) if (hours >= STAGES[i].fromH) return i;
  return 0;
}

/** End status: completed when the target was reached, broken when ended early. */
export function endStatus(fast: Fast, endAt: string): "completed" | "broken" {
  return elapsedMs({ startAt: fast.startAt, endAt }, 0) >= fast.targetHours * HOUR_MS ? "completed" : "broken";
}

/** Validate a start/end edit. */
export function validateTimes(startAt: string, endAt: string | undefined, now: number): string | null {
  const s = Date.parse(startAt);
  if (Number.isNaN(s)) return "Start time is not valid.";
  if (s > now + MIN_MS) return "Start can't be in the future.";
  if (endAt) {
    const e = Date.parse(endAt);
    if (Number.isNaN(e)) return "End time is not valid.";
    if (e < s) return "End must be after start.";
    if (e > now + MIN_MS) return "End can't be in the future.";
  }
  return null;
}

/**
 * The start/end edits from two datetime-local fields, keeping only the ones that differ from the
 * stored time at minute precision. An untouched field is left alone, so its seconds survive and
 * a completed fast can't flip to broken just by saving.
 */
export function editedTimes(
  fast: Pick<Fast, "startAt" | "endAt">,
  startLocal: string,
  endLocal: string,
): { startAt?: string; endAt?: string } {
  const out: { startAt?: string; endAt?: string } = {};
  if (startLocal !== toLocalInput(fast.startAt)) out.startAt = fromLocalInput(startLocal);
  if (endLocal !== toLocalInput(fast.endAt ?? fast.startAt)) out.endAt = fromLocalInput(endLocal);
  return out;
}

/**
 * Fasts can't overlap. Checks a start (and end, for an ended fast) against every other fast and
 * names the clash, so a backdated or edited start can't run into the fast before it.
 */
export function overlapError(
  startAt: string,
  endAt: string | undefined,
  fasts: Fast[],
  selfId?: string,
  tz: string = deviceTz(),
): string | null {
  const s = Date.parse(startAt);
  const e = endAt ? Date.parse(endAt) : Infinity;
  let clash: Fast | undefined;
  for (const o of fasts) {
    if (o.deletedAt || o.id === selfId) continue;
    const os = Date.parse(o.startAt);
    const oe = o.endAt ? Date.parse(o.endAt) : Infinity;
    if (os < e && oe > s && (!clash || os > Date.parse(clash.startAt))) clash = o;
  }
  if (!clash) return null;
  if (!clash.endAt) return `That overlaps your current fast, which started at ${formatDayTime(clash.startAt, tz)}.`;
  if (Date.parse(clash.startAt) <= s) {
    return `That overlaps your previous fast, which ended at ${formatDayTime(clash.endAt, tz)}.`;
  }
  return `That overlaps your next fast, which started at ${formatDayTime(clash.startAt, tz)}.`;
}

/**
 * Whether an entry at `at` belongs to (and can break) a fast that started at `fastStartAt`:
 * at or after the start, and not in the future (a future entry can't end a fast yet).
 */
export function entryInFast(fastStartAt: string, at: string, now: number): boolean {
  const t = Date.parse(at);
  return t >= Date.parse(fastStartAt) && t <= now + MIN_MS;
}

// ---------- Reminders ----------

export type ReminderKind = "halfway" | "target" | "window";

export interface DueReminder {
  kind: ReminderKind;
  fastId: string;
  message: string;
}

/** Reminders that are due now and not yet fired. `window` is for the eating window after a fast. */
export function dueReminders(fasts: Fast[], now: number): DueReminder[] {
  const out: DueReminder[] = [];
  for (const f of fasts) {
    if (f.deletedAt) continue;
    const fired = new Set(f.remindersFired ?? []);
    const start = Date.parse(f.startAt);
    const targetMs = f.targetHours * HOUR_MS;
    if (f.status === "active") {
      if (!fired.has("halfway") && now >= start + targetMs / 2 && now < start + targetMs) {
        out.push({ kind: "halfway", fastId: f.id, message: `Halfway through your ${f.protocol} fast.` });
      }
      if (!fired.has("target") && now >= start + targetMs) {
        out.push({ kind: "target", fastId: f.id, message: `Target reached: ${f.targetHours} h.` });
      }
    } else if (f.endAt && !fired.has("window") && !windowSuperseded(f, fasts)) {
      const w = windowHoursFor(f);
      if (w) {
        const closes = Date.parse(f.endAt) + w * HOUR_MS;
        if (now >= closes - 30 * MIN_MS && now < closes) {
          out.push({ kind: "window", fastId: f.id, message: "Eating window closes in 30 min." });
        }
      }
    }
  }
  return out;
}

/** True when another fast started after this one ended, so its eating window is already over. */
export function windowSuperseded(f: Pick<Fast, "id" | "endAt">, fasts: (Fast | null | undefined)[]): boolean {
  if (!f.endAt) return false;
  const end = Date.parse(f.endAt);
  return fasts.some((o) => !!o && !o.deletedAt && o.id !== f.id && Date.parse(o.startAt) >= end);
}

export function windowHoursFor(f: Pick<Fast, "protocol" | "targetHours">): number | undefined {
  if (f.protocol === "custom") return f.targetHours < 24 ? 24 - f.targetHours : undefined;
  return protocolDef(f.protocol).windowHours;
}

// ---------- History ----------

function live(fasts: Fast[]): Fast[] {
  return fasts.filter((f) => !f.deletedAt && f.endAt && f.status !== "active");
}

export function hitTarget(f: Fast): boolean {
  return !!f.endAt && elapsedMs(f, 0) >= f.targetHours * HOUR_MS;
}

/** Longest hours fasted per local day (keyed by the day the fast ended). */
export function dailyHours(fasts: Fast[], tz: string): Map<string, { hours: number; hit: boolean }> {
  const out = new Map<string, { hours: number; hit: boolean }>();
  for (const f of live(fasts)) {
    const key = dateKey(f.endAt!, tz);
    const hours = elapsedMs(f, 0) / HOUR_MS;
    const prev = out.get(key);
    out.set(key, { hours: Math.max(prev?.hours ?? 0, hours), hit: (prev?.hit ?? false) || hitTarget(f) });
  }
  return out;
}

/** Consecutive days (ending today, or yesterday if today has no fast yet) with a target hit. */
export function currentStreak(fasts: Fast[], now: number, tz: string): number {
  const days = dailyHours(fasts, tz);
  let day = dateKey(now, tz);
  if (!days.get(day)?.hit) day = addDays(day, -1);
  let n = 0;
  while (days.get(day)?.hit) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(fasts: Fast[], tz: string): number {
  const keys = [...dailyHours(fasts, tz).entries()]
    .filter(([, v]) => v.hit)
    .map(([k]) => k)
    .sort();
  let best = 0;
  let run = 0;
  for (let i = 0; i < keys.length; i++) {
    run = i > 0 && daysBetween(keys[i - 1], keys[i]) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export interface Averages {
  count: number;
  avgHours: number;
  hitRate: number;
}

/** Averages over fasts that ended within the last `days` local days, including today. */
export function averages(fasts: Fast[], now: number, tz: string, days: number): Averages {
  const today = dateKey(now, tz);
  const inRange = live(fasts).filter((f) => {
    const d = daysBetween(dateKey(f.endAt!, tz), today);
    return d >= 0 && d < days;
  });
  if (inRange.length === 0) return { count: 0, avgHours: 0, hitRate: 0 };
  const total = inRange.reduce((s, f) => s + elapsedMs(f, 0), 0);
  return {
    count: inRange.length,
    avgHours: total / inRange.length / HOUR_MS,
    hitRate: inRange.filter(hitTarget).length / inRange.length,
  };
}

/** Gentle protocol suggestion (spec: suggest 18:6 2–4×/week once 16:8 is easy). */
export function protocolSuggestion(fasts: Fast[], now: number, tz: string): string | null {
  const recent = live(fasts).filter((f) => daysBetween(dateKey(f.endAt!, tz), dateKey(now, tz)) < 14);
  const easy16 = recent.filter((f) => f.protocol === "16:8" && hitTarget(f) && (f.hunger ?? 3) <= 3);
  const longer = recent.filter((f) => ["18:6", "20:4", "OMAD"].includes(f.protocol));
  if (easy16.length >= 7 && longer.length < 2) {
    return "16:8 looks easy. Try 18:6 on 2–4 days this week.";
  }
  const omadWeek = recent.filter(
    (f) => f.protocol === "OMAD" && daysBetween(dateKey(f.endAt!, tz), dateKey(now, tz)) < 7,
  );
  if (omadWeek.length >= 2) return "OMAD is max 1–2×/week. Stick with 16:8 or 18:6 for the rest of the week.";
  return null;
}
