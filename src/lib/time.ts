// Time helpers. Everything stored is a UTC ISO string; days are grouped in the device zone.

export const HOUR_MS = 3_600_000;
export const MIN_MS = 60_000;

export function deviceTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver";
  } catch {
    return "America/Denver";
  }
}

/** YYYY-MM-DD for an instant in the given zone. */
export function dateKey(at: string | number | Date, tz: string = deviceTz()): string {
  const d = at instanceof Date ? at : new Date(at);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole days from a to b (YYYY-MM-DD), b - a. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD key. */
export function weekdayOf(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "3:07:09" or "07:09" from milliseconds (never negative). */
export function formatClock(ms: number, withHours = true): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return withHours || h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "16h 05m" */
export function formatHours(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / MIN_MS));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function formatTime(at: string | number, tz: string = deviceTz()): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
    new Date(at),
  );
}

export function formatDayTime(at: string | number, tz: string = deviceTz()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

/** Value for <input type="datetime-local"> in the device zone. */
export function toLocalInput(at: string | number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a datetime-local value (device zone) back to UTC ISO. */
export function fromLocalInput(value: string): string {
  const iso = parseLocalInput(value);
  if (!iso) throw new Error("Enter a valid date and time.");
  return iso;
}

/** Like fromLocalInput, but null for an empty or invalid value. */
export function parseLocalInput(value: string): string | null {
  if (!value.trim()) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** "Chapter time" like "1:30:59" or "43:47" → seconds. */
export function chapterSeconds(t: string): number {
  return t
    .split(":")
    .map(Number)
    .reduce((acc, n) => acc * 60 + n, 0);
}
