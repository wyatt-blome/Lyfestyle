// Weeks are identified by their first day as an ISO date ("2026-10-25"). All arithmetic is on
// calendar dates at noon UTC so daylight-saving changes never shift a day.

export function todayIn(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function toDate(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekStartFor(iso: string, weekStartsOn: number): string {
  const d = toDate(iso);
  const diff = (d.getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(iso, -diff);
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDate(s).getTime());
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function dayName(weekStart: string, offset: number, short = false): string {
  const name = DAY_NAMES[toDate(addDays(weekStart, offset)).getUTCDay()];
  return short ? name.slice(0, 3) : name;
}

export function formatWeek(weekStart: string): string {
  const fmt = (iso: string) => toDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(weekStart)} – ${fmt(addDays(weekStart, 6))}`;
}

export function shortDate(iso: string): string {
  return toDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
