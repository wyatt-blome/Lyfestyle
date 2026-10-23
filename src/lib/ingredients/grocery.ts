import { AISLE_ORDER, packagesFor, wasteWeight, type Aisle, type Base, type CatalogItem, type Pkg, type Store } from "./catalog";
import { identify } from "./normalize";
import { isSectionHeader, parseIngredientLine, type ParsedIngredient } from "./parse";
import { formatAmount, formatQuantity, humanize, isPlural, toBase, UNITS, type Dimension } from "./units";

export interface RecipeForList {
  id: string;
  title: string;
  /** servings the recipe makes as written; null when unknown */
  servings: number | null;
  ingredients: string[];
}

export interface PlannedRecipe {
  recipe: RecipeForList;
  /** servings wanted; the recipe is scaled by servings / recipe.servings */
  servings: number | null;
}

interface Source {
  recipeId: string;
  title: string;
  text: string;
}

/** One ingredient's total across the plan, before packaging. */
export interface Need {
  key: string;
  name: string;
  aisle: Aisle;
  item?: CatalogItem;
  /** base unit the amount is counted in: catalog base, or ml/g/each/<count unit> for unknown items */
  base: string;
  amount: number;
  /** measures we could not convert (e.g. "1 bag" of something unknown), kept as text */
  extras: string[];
  /** only "to taste" style mentions */
  asNeeded: boolean;
  /** how recipes measured it, so the total reads in the same terms */
  dims: Set<Dimension | `count:${string}`>;
  volumeMl: number;
  sources: Source[];
}

export interface Leftover {
  /** amount left over in the item's base unit */
  amount: number;
  text: string;
  /** 0 = nothing that spoils, 1 ≈ a whole package that will spoil */
  waste: number;
  keepsDays: number;
  freezes: boolean;
}

export interface GroceryLine {
  key: string;
  name: string;
  aisle: Aisle;
  needText: string;
  buy: { label: string; count: number }[] | null;
  buyText: string;
  leftover: Leftover | null;
  pantry: boolean;
  asNeeded: boolean;
  sources: Source[];
}

function scaleFor(p: PlannedRecipe): number {
  if (!p.servings || !p.recipe.servings || p.recipe.servings <= 0) return 1;
  return p.servings / p.recipe.servings;
}

function eachToBase(qty: number, item: CatalogItem): number | null {
  if (item.base === "each") return qty;
  if (item.base === "g" && item.gEach) return qty * item.gEach;
  if (item.base === "ml" && item.mlEach) return qty * item.mlEach;
  return null;
}

/** Convert a parsed amount into the catalog item's base unit, or null when it cannot be done. */
export function toItemBase(p: ParsedIngredient, item: CatalogItem): number | null {
  if (p.quantity === null) return null;
  let qty = p.quantity;
  let unit = p.unit;
  if (p.size) {
    qty = qty * p.size.amount;
    unit = p.size.unit;
  }
  if (!unit || unit === "each") return eachToBase(qty, item);
  const def = UNITS[unit];
  if (!def) return null;
  if (def.dim === "count") {
    const per = item.units?.[unit];
    if (per !== undefined) return qty * per;
    if (["package", "container", "bag", "box", "can", "jar", "bottle"].includes(unit)) {
      const smallest = Math.min(...item.walmart.map((w) => w.size));
      return qty * smallest;
    }
    if (item.base === "each" && !item.eachLabel) return qty;
    return eachToBase(qty, item);
  }
  const { amount } = toBase(qty, unit);
  if (def.dim === "volume") {
    if (item.base === "ml") return amount;
    if (item.base === "g") {
      if (item.gPerMl) return amount * item.gPerMl;
      if (item.gEach && item.mlEach) return (amount / item.mlEach) * item.gEach;
      return null;
    }
    return item.mlEach ? amount / item.mlEach : null;
  }
  // weight
  if (item.base === "g") return amount;
  if (item.base === "ml") return item.gPerMl ? amount / item.gPerMl : null;
  return item.gEach ? amount / item.gEach : null;
}

function describeSource(p: ParsedIngredient, scale: number): string {
  if (p.quantity === null) return p.note ? `${p.name} (${p.note})` : p.name;
  const qty = p.quantity * scale;
  const size = p.size ? ` (${formatQuantity(p.size.amount, p.size.unit)})` : "";
  return `${formatQuantity(qty, p.unit)}${size} ${p.name}`.replace(/\s+/g, " ").trim();
}

const parseCache = new Map<string, ParsedIngredient[]>();

export function parseIngredients(lines: string[]): ParsedIngredient[] {
  const cacheKey = lines.join("\n");
  const hit = parseCache.get(cacheKey);
  if (hit) return hit;
  const parsed = lines.filter((l) => l.trim() && !isSectionHeader(l)).map(parseIngredientLine).filter((p) => p.name);
  if (parseCache.size > 5000) parseCache.clear();
  parseCache.set(cacheKey, parsed);
  return parsed;
}

/** Sum every planned recipe's ingredients by grocery item. */
export function collectNeeds(plan: PlannedRecipe[]): Map<string, Need> {
  const needs = new Map<string, Need>();
  for (const planned of plan) {
    const scale = scaleFor(planned);
    for (const p of parseIngredients(planned.recipe.ingredients)) {
      const id = identify(p.name);
      let base: string;
      let amount: number | null = null;
      let dim: Dimension | `count:${string}` | null = null;
      if (p.quantity !== null) {
        const unit = p.size ? p.size.unit : p.unit;
        const def = unit ? UNITS[unit] : undefined;
        dim = def ? (def.dim === "count" ? `count:${def.key}` : def.dim) : "count:each";
      }
      if (id.item) {
        base = id.item.base;
        amount = toItemBase(p, id.item);
      } else if (p.quantity !== null) {
        const unit = p.size ? p.size.unit : (p.unit ?? "each");
        const qty = p.size ? p.quantity * p.size.amount : p.quantity;
        const b = toBase(qty, unit);
        base = b.dim === "volume" ? "ml" : b.dim === "weight" ? "g" : unit;
        amount = b.amount;
      } else {
        base = "each";
      }
      const mapKey = id.item ? id.key : `${id.key}|${base}`;
      let need = needs.get(mapKey);
      if (!need) {
        need = {
          key: id.key,
          name: id.name,
          aisle: id.aisle,
          item: id.item,
          base,
          amount: 0,
          extras: [],
          asNeeded: true,
          dims: new Set(),
          volumeMl: 0,
          sources: [],
        };
        needs.set(mapKey, need);
      }
      if (p.quantity !== null && !p.optional) {
        need.asNeeded = false;
        if (amount !== null) {
          need.amount += amount * scale;
          if (dim) need.dims.add(dim);
          if (dim === "volume") {
            const unit = p.size ? p.size.unit : p.unit!;
            need.volumeMl += toBase(p.quantity * (p.size ? p.size.amount : 1), unit).amount * scale;
          }
        } else {
          need.extras.push(describeSource(p, scale));
        }
      }
      need.sources.push({ recipeId: planned.recipe.id, title: planned.recipe.title, text: describeSource(p, scale) });
    }
  }
  return needs;
}

/** Two needs for the same item added together (does not modify either). */
export function mergeNeed(a: Need, b: Need): Need {
  return {
    ...a,
    amount: a.amount + b.amount,
    extras: [...a.extras, ...b.extras],
    asNeeded: a.asNeeded && b.asNeeded,
    dims: new Set([...a.dims, ...b.dims]),
    volumeMl: a.volumeMl + b.volumeMl,
    sources: [...a.sources, ...b.sources],
  };
}

interface Choice {
  picks: { pkg: Pkg; count: number }[];
  total: number;
}

/** Cheapest-in-waste combination of package sizes covering the need, fewest packages on ties. */
export function choosePackages(need: number, pkgs: Pkg[]): Choice | null {
  if (!pkgs.length || need <= 0) return null;
  // Recipes forgive a few percent; don't open a second package for 3% more.
  const target = need * 0.95;
  const sizes = [...pkgs].sort((a, b) => a.size - b.size).slice(0, 4);
  let best: Choice | null = null;
  let bestLeft = Infinity;
  let bestCount = Infinity;
  const limits = sizes.map((s) => Math.min(60, Math.ceil(target / s.size) + 1));
  const counts = new Array(sizes.length).fill(0);
  const visit = (i: number) => {
    if (i === sizes.length) {
      const total = counts.reduce((sum, c, j) => sum + c * sizes[j].size, 0);
      if (total < target) return;
      const left = total - need;
      const n = counts.reduce((a, b) => a + b, 0);
      // Prefer less leftover; within ~5% of a package, prefer fewer packages.
      const tolerance = sizes[0].size * 0.05;
      if (left < bestLeft - tolerance || (Math.abs(left - bestLeft) <= tolerance && n < bestCount)) {
        bestLeft = left;
        bestCount = n;
        best = { picks: sizes.map((pkg, j) => ({ pkg, count: counts[j] })).filter((p) => p.count > 0), total };
      }
      return;
    }
    for (let c = 0; c <= limits[i]; c++) {
      counts[i] = c;
      visit(i + 1);
    }
    counts[i] = 0;
  };
  visit(0);
  return best;
}

function eachText(amount: number, item: CatalogItem | undefined, fallbackUnit = "each"): string {
  if (item?.eachLabel) {
    const [one, many] = item.eachLabel;
    return `${formatAmount(amount)} ${isPlural(amount) ? many : one}`;
  }
  if (fallbackUnit !== "each" && UNITS[fallbackUnit]) return formatQuantity(amount, fallbackUnit);
  return formatAmount(amount);
}

function baseText(base: string, amount: number, item?: CatalogItem, preferVolumeMl?: number): string {
  if (preferVolumeMl !== undefined) {
    const h = humanize("volume", preferVolumeMl);
    return formatQuantity(h.amount, h.unit);
  }
  if (base === "g") {
    const h = humanize("weight", amount);
    return formatQuantity(h.amount, h.unit);
  }
  if (base === "ml") {
    const h = humanize("volume", amount);
    return formatQuantity(h.amount, h.unit);
  }
  return eachText(amount, item, base);
}

function leftoverText(base: Base, amount: number, item: CatalogItem): string {
  if (base === "each") return item.eachLabel ? eachText(amount, item) : `${formatAmount(amount)} ${item.name.toLowerCase()}`;
  if (base === "g" && item.gPerMl && item.aisle !== "Meat & Seafood") {
    const ml = amount / item.gPerMl;
    const h = humanize("volume", ml);
    if (h.unit === "cup" || h.unit === "tbsp") return formatQuantity(h.amount, h.unit);
  }
  return baseText(base, amount, item);
}

export function finalize(need: Need, store: Store, pantryKeys: Set<string>): GroceryLine {
  const item = need.item;
  const pantry = Boolean(item?.pantry) || pantryKeys.has(need.key);
  const allVolume = need.dims.size === 1 && need.dims.has("volume");
  let needText = "";
  if (need.amount > 0) {
    needText = baseText(need.base, need.amount, item, allVolume ? need.volumeMl : undefined);
    // A bare count next to the name reads oddly ("Yellow onion 2⅔").
    if (need.base === "each" && !item?.eachLabel && !allVolume) needText = `${needText} needed`;
  }
  if (need.extras.length) needText = [needText, ...need.extras].filter(Boolean).join(" + ");
  if (!needText) needText = need.asNeeded ? "as needed" : "some";

  let buy: GroceryLine["buy"] = null;
  let buyText = needText;
  let leftover: Leftover | null = null;
  if (item) {
    const pkgs = packagesFor(item, store);
    let amount = need.amount;
    if (amount <= 0 && (need.extras.length || !need.asNeeded)) amount = Math.min(...pkgs.map((p) => p.size));
    const choice = amount > 0 ? choosePackages(amount, pkgs) : null;
    if (choice) {
      buy = choice.picks.map((p) => ({ label: p.pkg.label, count: p.count }));
      buyText = buy.map((b) => (b.count > 1 ? `${b.count} × ${b.label}` : b.label)).join(" + ");
      const left = Math.max(0, choice.total - need.amount);
      // Sealed units in a multi-pack keep; only the opened one is at risk.
      const sealed = choice.picks.find((p) => p.pkg.units && p.pkg.units > 1);
      let opened = left;
      let unopened = 0;
      if (sealed) {
        const unitSize = sealed.pkg.size / sealed.pkg.units!;
        unopened = Math.floor(left / unitSize + 1e-6);
        opened = left - unopened * unitSize;
      }
      const smallest = Math.min(...pkgs.map((p) => (p.units ? p.size / p.units : p.size)));
      const significant = left > smallest * 0.1 && need.amount > 0;
      if (significant) {
        const openedText = opened > smallest * 0.05 ? leftoverText(item.base, opened, item) : "";
        leftover = {
          amount: left,
          text: unopened ? [openedText, `${unopened} unopened`].filter(Boolean).join(" plus ") : leftoverText(item.base, left, item),
          waste: pantry ? 0 : (wasteWeight(item) * opened) / smallest,
          keepsDays: item.keepsDays,
          freezes: Boolean(item.freezes),
        };
      }
    }
  }
  return {
    key: need.key,
    name: need.name,
    aisle: need.aisle,
    needText,
    buy,
    buyText,
    leftover,
    pantry,
    asNeeded: need.asNeeded,
    sources: need.sources,
  };
}

export function buildGroceryList(plan: PlannedRecipe[], store: Store, pantryKeys: Set<string> = new Set()): GroceryLine[] {
  const lines = [...collectNeeds(plan).values()].map((n) => finalize(n, store, pantryKeys));
  return sortLines(lines);
}

export function sortLines<T extends { aisle: Aisle; name: string }>(lines: T[]): T[] {
  return lines.sort((a, b) => AISLE_ORDER.indexOf(a.aisle) - AISLE_ORDER.indexOf(b.aisle) || a.name.localeCompare(b.name));
}

/** Total spoilage risk of a list, in "packages that will go bad". */
export function totalWaste(lines: GroceryLine[]): number {
  return lines.reduce((sum, l) => sum + (l.leftover?.waste ?? 0), 0);
}
