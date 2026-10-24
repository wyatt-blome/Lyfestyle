import { CATALOG, type CatalogItem, type Aisle } from "./catalog";
import { sentenceCase } from "./names";

// Words that describe how an ingredient is prepared or sized, not what to buy.
const DESCRIPTORS = new Set([
  "fresh",
  "freshly",
  "chopped",
  "finely",
  "roughly",
  "coarsely",
  "thinly",
  "thickly",
  "diced",
  "minced",
  "sliced",
  "grated",
  "julienned",
  "cubed",
  "crushed",
  "mashed",
  "peeled",
  "seeded",
  "deveined",
  "trimmed",
  "rinsed",
  "drained",
  "packed",
  "lightly",
  "loosely",
  "firmly",
  "softened",
  "melted",
  "cold",
  "chilled",
  "warm",
  "hot",
  "room",
  "temperature",
  "large",
  "medium",
  "small",
  "extra-large",
  "jumbo",
  "organic",
  "raw",
  "uncooked",
  "about",
  "approximately",
  "heaping",
  "level",
  "good",
  "quality",
  "store-bought",
  "homemade",
  "your",
  "favorite",
  "plus",
  "some",
  "few",
  "torn",
  "halved",
  "quartered",
  "cut",
  "into",
  "pieces",
  "piece",
  "inch",
  "bite-size",
  "bite-sized",
  "wedges",
  "for",
  "and",
  "or",
  "the",
  "of",
  "a",
  "an",
  "to",
  "taste",
  "optional",
  "divided",
  "juiced",
  "zested",
]);

const NO_SINGULAR = new Set([
  "asparagus",
  "hummus",
  "couscous",
  "molasses",
  "swiss",
  "brussels",
  "grits",
  "bass",
  "watercress",
  "series",
  "cheese",
  "lettuce",
  "mayonnaise",
  "tortellini",
  "gnocchi",
  "plus",
  "citrus",
  "octopus",
  "hibiscus",
]);

const VES_TO_F: Record<string, string> = { leaves: "leaf", halves: "half", loaves: "loaf", knives: "knife", calves: "calf" };

export function singularize(word: string): string {
  if (word.length <= 3 || NO_SINGULAR.has(word)) return word;
  if (word.endsWith("ies")) return word.slice(0, -3) + "y"; // berries → berry
  if (word.endsWith("oes")) return word.slice(0, -2); // tomatoes → tomato
  if (VES_TO_F[word]) return VES_TO_F[word];
  if (word.endsWith("ves")) return word.slice(0, -1); // olives, cloves, chives
  if (/(ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2); // bunches, radishes
  if (word.endsWith("ss") || word.endsWith("us") || word.endsWith("is")) return word;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

export function basicNormalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // jalapeño → jalapeno
    .replace(/\([^)]*\)/g, " ")
    .replace(/[®™*"“”]/g, "")
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9&%' -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalWords(name: string): string[] {
  return basicNormalize(name)
    .split(" ")
    .map((w) => w.replace(/^-+|-+$/g, ""))
    .filter((w) => w && !/^\d/.test(w))
    .map(singularize);
}

interface AliasEntry {
  words: string[];
  item: CatalogItem;
}

let aliasIndex: { exact: Map<string, CatalogItem>; byLength: AliasEntry[] } | null = null;

function index() {
  if (aliasIndex) return aliasIndex;
  const exact = new Map<string, CatalogItem>();
  const entries: AliasEntry[] = [];
  for (const item of CATALOG) {
    for (const alias of item.aliases) {
      const words = canonicalWords(alias);
      const key = words.join(" ");
      if (!key) continue;
      if (!exact.has(key)) exact.set(key, item);
      entries.push({ words, item });
    }
  }
  entries.sort((a, b) => b.words.length - a.words.length || b.words.join(" ").length - a.words.join(" ").length);
  aliasIndex = { exact, byLength: entries };
  return aliasIndex;
}

function containsSequence(hay: string[], needle: string[]): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

export interface IngredientIdentity {
  /** catalog key, or "x:<words>" for an item the catalog does not know */
  key: string;
  name: string;
  aisle: Aisle;
  item?: CatalogItem;
}

const AISLE_GUESSES: [RegExp, Aisle][] = [
  [/\b(chicken|beef|pork|turkey|lamb|steak|sausage|bacon|shrimp|salmon|fish|cod|tilapia|crab|scallop|prosciutto|pepperoni|salami|chorizo|meatball)\b/, "Meat & Seafood"],
  [/\b(cheese|milk|cream|yogurt|butter|egg)\b/, "Dairy & Eggs"],
  [/\b(frozen)\b/, "Frozen"],
  [/\b(bread|bun|roll|tortilla|pita|naan|bagel|croissant|biscuit)\b/, "Bakery & Bread"],
  [/\b(can|canned|bean|soup|broth|stock)\b/, "Canned & Jarred"],
  [/\b(pasta|noodle|rice|quinoa|couscous|barley|farro|lentil|oat)\b/, "Pasta, Rice & Grains"],
  [/\b(flour|sugar|baking|yeast|cocoa|chocolate|vanilla|extract|sprinkle)\b/, "Baking"],
  [/\b(sauce|oil|vinegar|dressing|ketchup|mustard|mayo|syrup|honey|jam|jelly|relish|pickle)\b/, "Oils, Sauces & Condiments"],
  [/\b(ground|dried|powder|seasoning|spice|seed|clove|cinnamon|nutmeg|allspice|cardamom|turmeric|coriander|fennel)\b/, "Spices & Seasonings"],
  [/\b(chip|cracker|pretzel|nut|almond|walnut|pecan|cashew|peanut|raisin|cranberry)\b/, "Snacks"],
  [/\b(juice|soda|water|wine|beer|coffee|tea)\b/, "Beverages"],
  [/\b(lettuce|onion|pepper|tomato|potato|squash|bean sprout|radish|beet|eggplant|leek|fennel|herb|berry|apple|pear|peach|grape|melon|mango|pineapple|cherry|plum|kiwi|chive|sage|tarragon|arugula|chard|bok choy|artichoke|okra|turnip|parsnip)\b/, "Produce"],
];

function guessAisle(words: string): Aisle {
  for (const [re, aisle] of AISLE_GUESSES) if (re.test(words)) return aisle;
  return "Other";
}

const identifyCache = new Map<string, IngredientIdentity>();

/** Map an ingredient name from a recipe to the item you would put on a grocery list. */
export function identify(name: string): IngredientIdentity {
  const hit = identifyCache.get(name);
  if (hit) return hit;
  const id = identifyUncached(name);
  if (identifyCache.size > 20000) identifyCache.clear();
  identifyCache.set(name, id);
  return id;
}

function identifyUncached(name: string): IngredientIdentity {
  const { exact, byLength } = index();
  const all = canonicalWords(name);
  const meaningful = all.filter((w) => !DESCRIPTORS.has(w));
  for (const words of [all, meaningful]) {
    const hit = exact.get(words.join(" "));
    if (hit) return { key: hit.key, name: hit.name, aisle: hit.aisle, item: hit };
  }
  for (const entry of byLength) {
    if (containsSequence(meaningful, entry.words) || containsSequence(all, entry.words)) {
      return { key: entry.item.key, name: entry.item.name, aisle: entry.item.aisle, item: entry.item };
    }
  }
  const words = meaningful.length ? meaningful : all;
  const joined = words.join(" ");
  // Shown as the recipe wrote it (plurals and all), minus prep words: "fresh tarragon leaves,
  // chopped" → "Tarragon leaves".
  const original = basicNormalize(name)
    .split(" ")
    .filter((w) => w && !/^\d/.test(w) && !DESCRIPTORS.has(singularize(w.replace(/^-+|-+$/g, ""))))
    .join(" ");
  return {
    key: `x:${joined || basicNormalize(name)}`,
    name: sentenceCase(original || joined || name.trim()),
    aisle: guessAisle(joined),
  };
}
