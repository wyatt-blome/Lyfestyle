import { toNumber } from "./ingredients/parse";

// Every recipe shows how long it takes. Times the recipe gives are used as they are; when it gives
// none (photos, pasted text), the time is estimated from the steps ("bake 30 minutes") plus hands-on
// prep for the ingredient list, and shown as "about".

export interface RecipeTime {
  prep: number | null;
  cook: number | null;
  total: number;
  estimated: boolean;
}

const NUM = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?|an?|one|half(?: an?)?`;
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, half: 0.5, "half a": 0.5, "half an": 0.5 };
const DURATION = new RegExp(
  String.raw`\b(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*(hours?|hrs?|h|minutes?|mins?|m)\b(?!\s*(?:per|each|on each|a side|per side))`,
  "gi",
);

function amount(s: string): number {
  const w = WORDS[s.toLowerCase()];
  return w ?? toNumber(s);
}

/** Minutes of waiting and cooking the steps mention: "simmer 20-25 minutes" counts 25. */
export function stepMinutes(steps: string[]): number {
  let total = 0;
  for (const step of steps) {
    if (/\bovernight\b/i.test(step)) total += 8 * 60;
    for (const m of step.matchAll(DURATION)) {
      const n = amount(m[2] ?? m[1]);
      if (!Number.isFinite(n)) continue;
      total += /^h/i.test(m[3]) ? n * 60 : n;
    }
  }
  return Math.round(total);
}

export interface StepTimer {
  /** what the step says, e.g. "20-25 minutes" */
  label: string;
  /** seconds to count down (the longer end of a range) */
  seconds: number;
}

/** Times mentioned in one step, for one-tap timers; per-side times count too. */
export function stepTimers(step: string): StepTimer[] {
  const timers: StepTimer[] = [];
  const any = new RegExp(String.raw`\b(${NUM})(?:\s*(?:-|–|to)\s*(${NUM}))?\s*(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b`, "gi");
  for (const m of step.matchAll(any)) {
    const n = amount(m[2] ?? m[1]);
    if (!Number.isFinite(n) || n <= 0) continue;
    const unit = m[3].toLowerCase();
    const seconds = Math.round(unit.startsWith("h") ? n * 3600 : unit.startsWith("s") ? n : n * 60);
    if (seconds > 0 && seconds <= 24 * 3600) timers.push({ label: m[0].trim(), seconds });
  }
  return timers;
}

/** Hands-on time for the ingredient list: chopping takes longer than measuring. */
export function prepEstimate(ingredients: string[]): number {
  let minutes = 5;
  for (const line of ingredients) {
    if (/:\s*$/.test(line)) continue;
    minutes += /\b(chopped|diced|minced|sliced|grated|shredded|peeled|julienned|cubed|trimmed|zested)\b/i.test(line) ? 3 : 1;
  }
  return Math.min(45, minutes);
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

export function recipeTime(r: {
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredients: string[];
  steps: string[];
}): RecipeTime | null {
  if (r.totalMinutes || r.prepMinutes || r.cookMinutes) {
    const total = r.totalMinutes || (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
    return { prep: r.prepMinutes, cook: r.cookMinutes, total, estimated: false };
  }
  if (!r.ingredients.length && !r.steps.length) return null;
  const prep = prepEstimate(r.ingredients);
  const cook = stepMinutes(r.steps);
  return { prep: round5(prep), cook: cook ? round5(cook) : null, total: round5(prep + cook), estimated: true };
}

/** "45 min", "1 hr 15 min", "about 2 hr" */
export function formatMinutes(minutes: number, estimated = false): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const text = h ? `${h} hr${m ? ` ${m} min` : ""}` : `${m} min`;
  return estimated ? `about ${text}` : text;
}
