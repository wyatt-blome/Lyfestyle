// Units a recipe line can use, grouped by what they measure. Volume converts through millilitres
// and weight through grams. Count units ("clove", "can", "bunch") only convert through the
// ingredient catalog, which knows how big a can of tomatoes or a bunch of cilantro is.

export type Dimension = "volume" | "weight" | "count";

export interface UnitDef {
  key: string;
  dim: Dimension;
  /** millilitres or grams per unit; 1 for count units */
  factor: number;
  singular: string;
  plural: string;
}

const defs: UnitDef[] = [
  { key: "tsp", dim: "volume", factor: 4.92892, singular: "tsp", plural: "tsp" },
  { key: "tbsp", dim: "volume", factor: 14.7868, singular: "tbsp", plural: "tbsp" },
  { key: "cup", dim: "volume", factor: 236.588, singular: "cup", plural: "cups" },
  { key: "floz", dim: "volume", factor: 29.5735, singular: "fl oz", plural: "fl oz" },
  { key: "pint", dim: "volume", factor: 473.176, singular: "pint", plural: "pints" },
  { key: "quart", dim: "volume", factor: 946.353, singular: "quart", plural: "quarts" },
  { key: "gallon", dim: "volume", factor: 3785.41, singular: "gallon", plural: "gallons" },
  { key: "ml", dim: "volume", factor: 1, singular: "ml", plural: "ml" },
  { key: "l", dim: "volume", factor: 1000, singular: "liter", plural: "liters" },
  { key: "pinch", dim: "volume", factor: 0.31, singular: "pinch", plural: "pinches" },
  { key: "dash", dim: "volume", factor: 0.62, singular: "dash", plural: "dashes" },
  { key: "oz", dim: "weight", factor: 28.3495, singular: "oz", plural: "oz" },
  { key: "lb", dim: "weight", factor: 453.592, singular: "lb", plural: "lb" },
  { key: "g", dim: "weight", factor: 1, singular: "g", plural: "g" },
  { key: "kg", dim: "weight", factor: 1000, singular: "kg", plural: "kg" },
  ...[
    ["each", "", ""],
    ["clove", "clove", "cloves"],
    ["can", "can", "cans"],
    ["jar", "jar", "jars"],
    ["bottle", "bottle", "bottles"],
    ["bunch", "bunch", "bunches"],
    ["head", "head", "heads"],
    ["stalk", "stalk", "stalks"],
    ["sprig", "sprig", "sprigs"],
    ["stick", "stick", "sticks"],
    ["slice", "slice", "slices"],
    ["package", "package", "packages"],
    ["bag", "bag", "bags"],
    ["box", "box", "boxes"],
    ["container", "container", "containers"],
    ["piece", "piece", "pieces"],
    ["fillet", "fillet", "fillets"],
    ["link", "link", "links"],
    ["loaf", "loaf", "loaves"],
    ["ear", "ear", "ears"],
    ["leaf", "leaf", "leaves"],
  ].map(([key, singular, plural]): UnitDef => ({ key, dim: "count", factor: 1, singular, plural })),
];

export const UNITS: Record<string, UnitDef> = Object.fromEntries(defs.map((d) => [d.key, d]));

// Lower-cased spellings. "T" and "t" are case-sensitive and handled in lookupUnit.
const aliasList: Record<string, string[]> = {
  tsp: ["tsp", "tsps", "teaspoon", "teaspoons", "tsp.", "tspn", "ts"],
  tbsp: ["tbsp", "tbsps", "tablespoon", "tablespoons", "tbsp.", "tbs", "tbs.", "tbl", "tbl.", "tblsp"],
  cup: ["cup", "cups", "c", "c."],
  floz: ["fl oz", "fl. oz", "fl. oz.", "fluid ounce", "fluid ounces", "fl.oz", "floz"],
  pint: ["pint", "pints", "pt", "pt."],
  quart: ["quart", "quarts", "qt", "qt.", "qts"],
  gallon: ["gallon", "gallons", "gal", "gal."],
  ml: ["ml", "ml.", "milliliter", "milliliters", "millilitre", "millilitres", "mls"],
  l: ["l", "liter", "liters", "litre", "litres"],
  pinch: ["pinch", "pinches"],
  dash: ["dash", "dashes"],
  oz: ["oz", "oz.", "ounce", "ounces", "ozs"],
  lb: ["lb", "lb.", "lbs", "lbs.", "pound", "pounds", "#"],
  g: ["g", "g.", "gram", "grams", "gr", "grs"],
  kg: ["kg", "kg.", "kilogram", "kilograms", "kilo", "kilos"],
  clove: ["clove", "cloves"],
  can: ["can", "cans", "tin", "tins"],
  jar: ["jar", "jars"],
  bottle: ["bottle", "bottles"],
  bunch: ["bunch", "bunches", "bn"],
  head: ["head", "heads"],
  stalk: ["stalk", "stalks", "rib", "ribs"],
  sprig: ["sprig", "sprigs"],
  stick: ["stick", "sticks"],
  slice: ["slice", "slices"],
  package: ["package", "packages", "pkg", "pkg.", "pkgs", "packet", "packets", "pack", "packs", "envelope", "envelopes"],
  bag: ["bag", "bags"],
  box: ["box", "boxes"],
  container: ["container", "containers", "carton", "cartons", "tub", "tubs"],
  piece: ["piece", "pieces", "pc", "pcs"],
  fillet: ["fillet", "fillets", "filet", "filets"],
  link: ["link", "links"],
  loaf: ["loaf", "loaves"],
  ear: ["ear", "ears"],
  leaf: ["leaf", "leaves"],
};

const ALIASES = new Map<string, string>();
for (const [key, list] of Object.entries(aliasList)) for (const a of list) ALIASES.set(a, key);

/** Longest alias first, so "fl oz" wins over "fl" and "tablespoons" over "tablespoon". */
export const UNIT_ALIASES_BY_LENGTH = [...ALIASES.keys()].sort((a, b) => b.length - a.length);

export function lookupUnit(token: string): string | null {
  if (token === "T" || token === "Tb" || token === "Tbs") return "tbsp";
  if (token === "t") return "tsp";
  return ALIASES.get(token.toLowerCase()) ?? null;
}

export function toBase(amount: number, unit: string): { dim: Dimension; amount: number } {
  const def = UNITS[unit];
  if (!def) return { dim: "count", amount };
  return { dim: def.dim, amount: amount * def.factor };
}

const FRACTIONS: [number, string][] = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

/** 1.5 → "1½", 0.333 → "⅓", 2.1 → "2". Rounds to the nearest kitchen fraction. */
export function formatAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 10) return String(Math.round(n));
  let whole = Math.floor(n);
  const rest = n - whole;
  let best = "";
  let bestErr = rest;
  for (const [v, s] of FRACTIONS) {
    const err = Math.abs(rest - v);
    if (err < bestErr) {
      bestErr = err;
      best = s;
    }
  }
  if (1 - rest < bestErr) {
    whole += 1;
    best = "";
  }
  if (whole === 0 && !best) return FRACTIONS[0][1];
  return `${whole || ""}${best}`;
}

/** Plural unless the amount reads as one or less ("1 cup", "½ cup", "1½ cups"). */
export function isPlural(amount: number): boolean {
  const shown = formatAmount(amount);
  return !(shown === "1" || /^[⅛¼⅓⅜½⅝⅔¾⅞]$/.test(shown));
}

export function unitLabel(unit: string, amount: number): string {
  const def = UNITS[unit];
  if (!def) return unit;
  return isPlural(amount) ? def.plural : def.singular;
}

export function formatQuantity(amount: number, unit: string | null): string {
  const a = formatAmount(amount);
  if (!unit || unit === "each") return a;
  return `${a} ${unitLabel(unit, amount)}`.trim();
}

/**
 * Express a base amount (ml or g) in the friendliest US kitchen unit: 3 tsp → "1 tbsp",
 * 710 ml → "3 cups", 1360 g → "3 lb".
 */
export function humanize(dim: Dimension, base: number): { amount: number; unit: string } {
  if (dim === "weight") {
    if (base >= 453.592 * 0.95) return { amount: base / 453.592, unit: "lb" };
    return { amount: base / 28.3495, unit: "oz" };
  }
  if (dim === "volume") {
    if (base >= 3785.41 * 0.95) return { amount: base / 3785.41, unit: "gallon" };
    if (base >= 236.588 / 4 - 0.5) return { amount: base / 236.588, unit: "cup" };
    if (base >= 14.7868 - 0.1) return { amount: base / 14.7868, unit: "tbsp" };
    return { amount: base / 4.92892, unit: "tsp" };
  }
  return { amount: base, unit: "each" };
}
