import { CATALOG } from "../ingredients/catalog";
import { tidyTitle } from "../ingredients/names";
import { identify } from "../ingredients/normalize";
import { ING_HEAD, STARTS_WITH_AMOUNT, STEP_HEAD } from "./text";

// Finding the dish name on a photographed or screenshotted recipe. The first line is often not
// the name: "Prep Time", "Yield: 6 servings", a brand banner, or stray symbols the reader picked
// up. Lines near the top are scored on how much they read like a dish name instead.

const META =
  /^(?:yield|serv(?:es|ings?)|makes|prep|cook|total|active|inactive|calories|nutrition|macros|ingredients?|instructions?|directions?|method|steps?|notes?|tips?|you will need|you'll need|recipe by|by\b|print|pin\b|share|save|jump to|posted|course|cuisine|keywords?|author|equipment|page \d|step \d|serving size|difficulty|level|time\b|minutes?\b|hours?\b|\d+\s*(?:min|minutes|hours|servings))/i;
const BRANDS = /\b(?:hello\s*fresh|home\s*chef|blue\s*apron|factor|everyplate|green\s*chef|fast\s*&?\s*fresh|tiktok|instagram|facebook|pinterest|allrecipes|food\s*network|whisper)/i;

const DISH_WORDS = [
  "bake", "baked", "casserole", "soup", "stew", "chili", "chowder", "salad", "sandwich", "sandwiches", "wrap", "wraps", "taco", "tacos",
  "burrito", "burritos", "enchilada", "enchiladas", "quesadilla", "quesadillas", "fajita", "fajitas", "nachos", "skillet", "pasta",
  "rigatoni", "penne", "spaghetti", "lasagna", "ziti", "mac", "omelet", "omelette", "frittata", "quiche", "pie", "bread", "muffin",
  "muffins", "cookie", "cookies", "cake", "cupcakes", "bars", "brownies", "dip", "bowl", "bowls", "stir", "fry", "fried", "roasted",
  "grilled", "curry", "rice", "noodle", "noodles", "pancake", "pancakes", "waffle", "waffles", "meatball", "meatballs", "meatloaf",
  "burger", "burgers", "pizza", "chicken", "beef", "pork", "shrimp", "salmon", "steak", "egg", "eggs", "potato", "potatoes", "sheet",
  "pan", "one-pan", "crockpot", "slow", "cooker", "roast", "dumplings", "alfredo", "parmesan", "teriyaki", "gumbo", "jambalaya",
  "biscuits", "gravy", "scramble", "hash", "toast", "smoothie", "parfait", "oats", "oatmeal", "slaw", "coleslaw", "sliders", "kabobs",
  "chops", "thighs", "wings", "tenders", "nuggets", "cobbler", "crisp", "pudding", "risotto", "pilaf", "ramen", "pho", "lo", "mein",
  "sauce", "marinara", "pesto", "dinner", "breakfast", "lunch", "tuscan", "creamy", "cheesy", "garlic", "lemon", "honey", "bbq",
];

let food: Set<string> | null = null;
function foodWords(): Set<string> {
  if (food) return food;
  food = new Set(DISH_WORDS);
  for (const item of CATALOG) for (const alias of item.aliases) for (const w of alias.split(/[\s-]+/)) if (w.length > 2) food.add(w);
  for (const w of ["fresh", "fast", "hello", "with", "and", "the", "for", "mix", "blend", "style", "cup", "cups"]) food.delete(w);
  return food;
}

function hasFoodWord(t: string): boolean {
  const fw = foodWords();
  return words(cleanTitleText(t)).some((w) => {
    const lower = w.toLowerCase().replace(/[^a-z-]/g, "");
    return fw.has(lower) || fw.has(lower.replace(/e?s$/, "")) || lower.split("-").some((p) => fw.has(p));
  });
}

/** Strip symbols the reader picks up around a name: "_— Sheet Pan Omelet" → "Sheet Pan Omelet". */
export function cleanTitleText(line: string): string {
  return line
    .replace(/[*_#`~]+/g, " ")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/[^A-Za-z0-9)!'’]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function words(line: string): string[] {
  return line.split(/\s+/).filter(Boolean);
}

/** How much a line reads like a dish name; -Infinity when it clearly isn't one. */
export function titleScore(raw: string): number {
  const line = cleanTitleText(raw);
  // A sentence ("Egg Salad is a delicious recipe.") is a description, not a name.
  if (/\b(?:is|are|was|were|you|your|this|these|i|we|my)\b/i.test(line) && words(line).length > 3) return -Infinity;
  if (/[.!?]$/.test(raw.trim()) && words(line).length > 4) return -Infinity;
  if (line.length < 4 || line.length > 80) return -Infinity;
  if (META.test(line) || BRANDS.test(line) || /^(?:with|and|or|a|an|the)\b/i.test(line) && line.length < 12) return -Infinity;
  if (STARTS_WITH_AMOUNT.test(line) || ING_HEAD.test(line) || STEP_HEAD.test(line)) return -Infinity;
  if (/^[a-z]/.test(line) || /[:;]\s*\S|:$/.test(line) || /https?:|www\.|\.com\b|@/.test(line)) return -Infinity;
  if (/\d{2,}|°/.test(line)) return -Infinity;
  const ws = words(line);
  if (ws.length > 10 || (/[.!?]$/.test(line) && ws.length > 4)) return -Infinity;
  // Reader noise ("$Hich Qoder L o"): stray single letters and vowel-less fragments.
  const real = ws.filter((w) => /^[A-Za-z][A-Za-z'’-]*$/.test(w) && (w.length >= 3 || /^(?:a|&|of|to|in|on|or|n)$/i.test(w)) && /[aeiouy]/i.test(w));
  const quality = real.length / ws.filter((w) => w !== "&").length;
  if (quality < 0.75) return -Infinity;
  // A lone ingredient ("Shells", "Salt") is a list item, not the dish.
  if (ws.length === 1 && identify(line).item) return -Infinity;
  const fw = foodWords();
  const foodHits = ws.filter((w) => fw.has(w.toLowerCase().replace(/[^a-z-]/g, ""))).length;
  // One word is only a name if it's a dish ("Lasagna", "Meatloaf"), not some other word.
  if (ws.length === 1 && !foodHits) return -Infinity;
  let score = foodHits * 2;
  const capitalized = ws.filter((w) => /^[A-Z]/.test(w)).length / ws.length;
  if (capitalized >= 0.6) score += 1;
  if (ws.length >= 2 && ws.length <= 7) score += 0.5;
  return score;
}

/**
 * The dish name among the first lines of a page, with a "with a ..." subtitle joined on.
 * Returns the line indexes it used so they can be left out of the recipe body.
 */
export function pickTitle(lines: string[], window = 14): { title: string; used: number[] } | null {
  let best: { score: number; index: number } | null = null;
  lines.slice(0, window).forEach((line, index) => {
    const s = titleScore(line) - index * 0.2;
    if (s > 0.5 && (!best || s > best.score)) best = { score: s, index };
  });
  if (!best) return null;
  const { index } = best as { score: number; index: number };
  const used = [index];
  let title = tidyTitle(cleanTitleText(lines[index]));
  const next = lines[index + 1] ? cleanTitleText(lines[index + 1]) : "";
  if (/^with\s+/i.test(next) && next.length < 50 && !/\d/.test(next)) {
    title = `${title} ${tidyTitle(next).replace(/^With\b/, "with")}`;
    used.push(index + 1);
  }
  return { title, used };
}

/** Names that came out of a photo wrong: metadata, symbols, brand banners or reader noise. */
export function looksLikeBadTitle(title: string): boolean {
  const t = title.trim();
  if (!t || /^untitled|^pinned recipe$|^new recipe$/i.test(t)) return true;
  if (/^[^A-Za-z0-9"'“(]/.test(t)) return true;
  if (/^hello\b/i.test(t)) return true;
  // Nearly every dish name has a food word in it; "Hello Fast" doesn't.
  return titleScore(t) === -Infinity || !hasFoodWord(t);
}

/** A name to suggest for a recipe whose title is broken. */
export function suggestTitle(r: { title: string; description: string | null; ingredients: string[] }): string | null {
  const cleaned = cleanTitleText(r.title);
  if (cleaned && titleScore(cleaned) > 0.5) return tidyTitle(cleaned);
  // "Egg Salad is a delicious, versatile recipe…"
  const m = r.description?.match(/(?:^|\s)([A-Z][A-Za-z'’ &-]{3,50}?)\s+(?:is|are)\s+(?:a|an|the|so|my|our|perfect|delicious|easy)\b/);
  if (m && titleScore(m[1]) > 0.5) return tidyTitle(m[1]);
  return null;
}
