import type { Store } from "./ingredients/catalog";
import { collectNeeds, finalize, mergeNeed, type GroceryLine, type Need, type PlannedRecipe, type RecipeForList } from "./ingredients/grocery";
import { identify } from "./ingredients/normalize";
import { parseIngredients } from "./ingredients/grocery";
import { fitsSlot, moodScore, type MatchableRecipe, type MealType } from "./moods";

export interface CandidateRecipe extends RecipeForList, MatchableRecipe {
  isFavorite: boolean;
  /** household rating, 1-5 stars */
  rating?: number | null;
  isStaple: boolean;
  /** a staple wants to come back every N weeks */
  stapleEveryWeeks: number | null;
  /** ISO date this recipe was last on an approved plan */
  lastPlannedOn: string | null;
}

/** What the household asked for this week. */
export interface WeekRequest {
  moods: string[];
  note: string;
}

export interface Suggestion {
  recipe: CandidateRecipe;
  score: number;
  /** spoilage risk this meal adds (negative = it uses up leftovers) */
  wasteDelta: number;
  usesLeftovers: string[];
  sharesWithPlan: number;
  reasons: string[];
}

const DAY = 86400000;

function weeksSince(iso: string | null, today: Date): number | null {
  if (!iso) return null;
  return (today.getTime() - new Date(iso + "T00:00:00").getTime()) / (7 * DAY);
}

export function stapleIsDue(r: CandidateRecipe, today: Date): boolean {
  if (!r.isStaple) return false;
  const w = weeksSince(r.lastPlannedOn, today);
  return w === null || w >= (r.stapleEveryWeeks ?? 1) - 0.15;
}

function keysOf(recipe: RecipeForList): Set<string> {
  const keys = new Set<string>();
  for (const p of parseIngredients(recipe.ingredients)) {
    const id = identify(p.name);
    if (id.item?.pantry) continue;
    keys.add(id.key);
  }
  return keys;
}

const keyCache = new Map<string, Set<string>>();
function cachedKeys(recipe: RecipeForList): Set<string> {
  const k = recipe.id + "\u0000" + recipe.ingredients.join("\n");
  let hit = keyCache.get(k);
  if (!hit) {
    hit = keysOf(recipe);
    if (keyCache.size > 5000) keyCache.clear();
    keyCache.set(k, hit);
  }
  return hit;
}

const needCache = new Map<string, Map<string, Need>>();
function recipeNeeds(recipe: RecipeForList, servings: number | null): Map<string, Need> {
  const k = `${recipe.id}\u0000${servings}\u0000${recipe.servings}\u0000${recipe.ingredients.join("\n")}`;
  let hit = needCache.get(k);
  if (!hit) {
    hit = collectNeeds([{ recipe, servings }]);
    if (needCache.size > 5000) needCache.clear();
    needCache.set(k, hit);
  }
  return hit;
}

/** Leftovers worth planning around: perishable, at least a fifth of a package. */
export function riskyLeftovers(lines: GroceryLine[]): GroceryLine[] {
  return lines.filter((l) => l.leftover && l.leftover.waste >= 0.2).sort((a, b) => b.leftover!.waste - a.leftover!.waste);
}

/**
 * Rank recipes for one slot of the week. The rest of the plan stays fixed; each candidate is
 * scored by how much spoilage it adds or removes once everything is rounded to store packages,
 * plus favorites, staples that are due, and how recently it was made.
 */
export function rankForSlot(opts: {
  others: PlannedRecipe[];
  candidates: CandidateRecipe[];
  servings: number | null;
  mealType: MealType;
  request?: WeekRequest;
  store: Store;
  pantryKeys?: Set<string>;
  today?: Date;
  excludeIds?: Set<string>;
}): Suggestion[] {
  const { others, candidates, servings, mealType, store, pantryKeys = new Set(), today = new Date(), excludeIds = new Set() } = opts;
  const request = opts.request ?? { moods: [], note: "" };
  const baseNeeds = collectNeeds(others);
  const baseWasteByKey = new Map<string, number>();
  const baseLines: GroceryLine[] = [];
  for (const [mapKey, need] of baseNeeds) {
    const line = finalize(need, store, pantryKeys);
    baseLines.push(line);
    baseWasteByKey.set(mapKey, line.leftover?.waste ?? 0);
  }
  const risky = riskyLeftovers(baseLines);
  const planKeys = new Set(baseLines.filter((l) => !l.pantry).map((l) => l.key));
  const inPlan = new Set(others.map((o) => o.recipe.id));

  const out: Suggestion[] = [];
  for (const recipe of candidates) {
    if (excludeIds.has(recipe.id)) continue;
    const fit = fitsSlot(recipe.mealTypes, mealType);
    if (!fit) continue;
    // Only the items this recipe touches can change the week's waste.
    let wasteDelta = 0;
    for (const [mapKey, need] of recipeNeeds(recipe, servings)) {
      const base = baseNeeds.get(mapKey);
      const merged: Need = base ? mergeNeed(base, need) : need;
      wasteDelta += (finalize(merged, store, pantryKeys).leftover?.waste ?? 0) - (baseWasteByKey.get(mapKey) ?? 0);
    }
    const keys = cachedKeys(recipe);
    const usesLeftovers = risky.filter((l) => keys.has(l.key)).map((l) => l.name);
    let sharesWithPlan = 0;
    for (const k of keys) if (planKeys.has(k)) sharesWithPlan++;

    const reasons: string[] = [];
    let score = -wasteDelta * 2.5 + sharesWithPlan * 0.15 + (fit < 1 ? -0.4 : 0);
    const mood = moodScore(recipe, request.moods, request.note);
    if (request.moods.length || request.note.trim()) {
      score += mood * 3 - 1;
      if (mood >= 0.5) reasons.unshift("Fits what you asked for");
    }
    if (usesLeftovers.length) reasons.push(`Uses up ${listNames(usesLeftovers)}`);
    else if (wasteDelta <= 0.1) reasons.push("Adds little waste");
    if (wasteDelta >= 0.6) reasons.push("Leaves extra to use up");
    if (recipe.isFavorite) {
      score += 1;
      reasons.push("Favorite");
    }
    // 3 stars is neutral; 5 stars counts about as much as a favorite, 1 star pushes it down.
    if (recipe.rating) {
      score += (recipe.rating - 3) * 0.5;
      if (recipe.rating >= 4) reasons.push(`Rated ${recipe.rating}★`);
    }
    if (stapleIsDue(recipe, today)) {
      score += 1.5;
      reasons.push("Staple, due this week");
    } else if (recipe.isStaple) {
      score += 0.3;
      reasons.push("Staple");
    }
    const w = weeksSince(recipe.lastPlannedOn, today);
    if (w !== null && w < 2 && !recipe.isStaple) score -= 1.5;
    else if (w !== null && w < 4 && !recipe.isStaple) score -= 0.5;
    else if (w === null) score += 0.1;
    if (inPlan.has(recipe.id)) {
      score -= 10;
      reasons.push("Already this week");
    }
    if (sharesWithPlan >= 3) reasons.push(`Shares ${sharesWithPlan} ingredients with the week`);
    out.push({ recipe, score, wasteDelta, usesLeftovers, sharesWithPlan, reasons });
  }
  return out.sort((a, b) => b.score - a.score);
}

function listNames(names: string[]): string {
  const lower = names.map((n) => n.toLowerCase());
  if (lower.length <= 2) return lower.join(" and ");
  return `${lower.slice(0, 2).join(", ")} and more`;
}

export interface Slot {
  index: number;
  mealType: MealType;
  recipeId: string | null;
  servings: number | null;
  /** slots the household marked "eat out", "leftovers", etc. stay empty */
  locked: boolean;
}

/**
 * Fill empty slots: staples that are due first, then the best-scoring recipe for each slot in
 * turn. A little randomness among near-ties keeps weeks from repeating.
 */
export function autoFill(opts: {
  slots: Slot[];
  recipes: CandidateRecipe[];
  request?: WeekRequest;
  /** put staples that are due on the plan first */
  includeDueStaples?: boolean;
  store: Store;
  pantryKeys?: Set<string>;
  today?: Date;
  random?: () => number;
}): Map<number, string> {
  const { slots, recipes, store, pantryKeys, request, includeDueStaples = true, today = new Date(), random = Math.random } = opts;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const filled = new Map<number, string>();
  const used = new Set(slots.map((s) => s.recipeId).filter((id): id is string => Boolean(id)));
  const empty = slots.filter((s) => !s.recipeId && !s.locked);
  const current = (): PlannedRecipe[] => {
    const list: PlannedRecipe[] = [];
    for (const s of slots) {
      const id = filled.get(s.index) ?? s.recipeId;
      const r = id ? byId.get(id) : undefined;
      if (r) list.push({ recipe: r, servings: s.servings });
    }
    return list;
  };

  const due = includeDueStaples ? recipes.filter((r) => stapleIsDue(r, today) && !used.has(r.id)) : [];
  due.sort((a, b) => (weeksSince(b.lastPlannedOn, today) ?? 99) - (weeksSince(a.lastPlannedOn, today) ?? 99));
  for (const r of due) {
    const slot = empty.find((s) => !filled.has(s.index) && fitsSlot(r.mealTypes, s.mealType) === 1);
    if (!slot) continue;
    filled.set(slot.index, r.id);
    used.add(r.id);
  }

  for (const slot of empty) {
    if (filled.has(slot.index)) continue;
    const ranked = rankForSlot({
      others: current(),
      candidates: recipes,
      servings: slot.servings,
      mealType: slot.mealType,
      request,
      store,
      pantryKeys,
      today,
      excludeIds: used,
    });
    if (!ranked.length) break;
    const top = ranked[0].score;
    const near = ranked.filter((s) => s.score >= top - 0.75).slice(0, 4);
    const pick = near[Math.floor(random() * near.length)] ?? ranked[0];
    filled.set(slot.index, pick.recipe.id);
    used.add(pick.recipe.id);
  }
  return filled;
}
