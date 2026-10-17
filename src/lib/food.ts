// Food-log math (Phase 3): local-day bounds in a time zone, the fasting/eating split of a day for
// the timeline, and "copy yesterday". Pure: every result comes from stored timestamps and `now`.
import type { Fast, IntakeEntry, IntakeTemplate } from "./types";
import { addDays } from "./time";

export interface Interval {
  start: number;
  end: number;
}

/** Offset of a zone from UTC at an instant, in ms (Denver in summer = -6 h). */
export function zoneOffsetMs(at: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant a local clock reads `minutes` past midnight on day `key` in `tz`. */
export function zonedInstant(key: string, minutes: number, tz: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  // Two passes settle the offset across a DST change.
  let t = wall - zoneOffsetMs(wall, tz);
  t = wall - zoneOffsetMs(t, tz);
  return t;
}

/** Start and end (exclusive) of a local day. 23 or 25 h long on DST days. */
export function dayBounds(key: string, tz: string): Interval {
  return { start: zonedInstant(key, 0, tz), end: zonedInstant(addDays(key, 1), 0, tz) };
}

/** Minutes past local midnight for an instant. */
export function localMinutes(at: string | number, tz: string): number {
  const t = typeof at === "number" ? at : Date.parse(at);
  const local = t + zoneOffsetMs(t, tz);
  return Math.floor((((local % 86_400_000) + 86_400_000) % 86_400_000) / 60_000);
}

/** Sort and join overlapping or touching intervals. */
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** Fasting time inside [day.start, day.end), clipped to now. A running fast counts up to now. */
export function fastingIntervals(fasts: Fast[], day: Interval, now: number): Interval[] {
  const cap = Math.min(day.end, now);
  const raw: Interval[] = [];
  for (const f of fasts) {
    if (f.deletedAt) continue;
    const s = Date.parse(f.startAt);
    const e = f.endAt ? Date.parse(f.endAt) : now;
    const start = Math.max(s, day.start);
    const end = Math.min(e, cap);
    if (end > start) raw.push({ start, end });
  }
  return mergeIntervals(raw);
}

export type SegmentKind = "fasting" | "eating" | "untracked" | "future";

export interface Segment extends Interval {
  kind: SegmentKind;
}

/**
 * The day split into fasting, eating (time after a fast ended and before the next began),
 * untracked (time before any fast on record ended) and future (after now) segments, in order,
 * covering the whole day.
 */
export function daySegments(fasts: Fast[], day: Interval, now: number): Segment[] {
  const out: Segment[] = [];
  const cap = Math.max(day.start, Math.min(day.end, now));
  const ends = fasts.filter((f) => !f.deletedAt && f.endAt).map((f) => Date.parse(f.endAt!));
  const gap = (start: number, end: number) => {
    const firstEnd = Math.min(...ends.filter((e) => e < end), Infinity);
    if (firstEnd > start && firstEnd < end) {
      out.push({ start, end: firstEnd, kind: "untracked" });
      out.push({ start: firstEnd, end, kind: "eating" });
    } else {
      out.push({ start, end, kind: firstEnd <= start ? "eating" : "untracked" });
    }
  };
  let cursor = day.start;
  for (const f of fastingIntervals(fasts, day, now)) {
    if (f.start > cursor) gap(cursor, f.start);
    out.push({ ...f, kind: "fasting" });
    cursor = f.end;
  }
  if (cap > cursor) gap(cursor, cap);
  if (day.end > cap) out.push({ start: cap, end: day.end, kind: "future" });
  return out;
}

/** 0–1 position of an instant along the day (clamped). */
export function fractionOfDay(at: number, day: Interval): number {
  const len = day.end - day.start;
  if (len <= 0) return 0;
  return Math.min(1, Math.max(0, (at - day.start) / len));
}

/** Total hours of each kind in a set of segments. */
export function segmentHours(segments: Segment[]): Record<SegmentKind, number> {
  const out: Record<SegmentKind, number> = { fasting: 0, eating: 0, untracked: 0, future: 0 };
  for (const s of segments) out[s.kind] += (s.end - s.start) / 3_600_000;
  return out;
}

/** The reusable part of a logged entry (drops id, timestamps, time and fast link). */
export function templateOf(e: IntakeEntry): IntakeTemplate {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, createdAt, updatedAt, deletedAt, at, fastId, ...rest } = e;
  return { ...rest, tags: [...(rest.tags ?? [])] };
}

export interface CopyPlan {
  /** Entries to log now: same local clock time, today, at or before now. Oldest first. */
  copy: { at: string; template: IntakeTemplate }[];
  /** Entries whose clock time hasn't come yet today (left out). */
  later: number;
}

/** Plan for "Copy yesterday": each entry moves to `toKey` at the same local clock time. */
export function copyDayPlan(entries: IntakeEntry[], toKey: string, tz: string, now: number): CopyPlan {
  const copy: CopyPlan["copy"] = [];
  let later = 0;
  const sorted = entries.filter((e) => !e.deletedAt).sort((a, b) => a.at.localeCompare(b.at));
  for (const e of sorted) {
    const t = zonedInstant(toKey, localMinutes(e.at, tz), tz);
    if (t > now) later++;
    else copy.push({ at: new Date(t).toISOString(), template: templateOf(e) });
  }
  return { copy, later };
}

/** Label for a favorite made from an entry: "Greek yogurt · 1 cup". */
export function favoriteLabel(t: Pick<IntakeTemplate, "name" | "qty" | "unit">): string {
  return t.qty ? `${t.name} · ${t.qty}${t.unit ? ` ${t.unit}` : ""}` : t.name;
}
