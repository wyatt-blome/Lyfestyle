import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { HouseholdSettings, MealPlan, PlanMeal, Recipe, WeekRequestJson } from "@/db/schema";
import { addDays, todayIn, weekStartFor } from "@/lib/dates";
import { CATALOG_BY_KEY } from "@/lib/ingredients/catalog";
import { buildGroceryList, type PlannedRecipe } from "@/lib/ingredients/grocery";
import { fitsSlot, inferMealTypes, type MealType } from "@/lib/moods";
import { recipeTime } from "@/lib/time";
import { autoFill, type CandidateRecipe, type Slot } from "@/lib/planner";

export function currentWeekStart(settings: HouseholdSettings): string {
  return weekStartFor(todayIn(settings.timeZone), settings.weekStartsOn);
}

export async function householdRecipes(householdId: string): Promise<Recipe[]> {
  const db = await getDb();
  return db.select().from(schema.recipes).where(eq(schema.recipes.householdId, householdId)).orderBy(asc(schema.recipes.title));
}

export function toCandidate(r: Recipe): CandidateRecipe {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    servings: r.servings,
    ingredients: r.ingredients,
    tags: r.tags,
    // Given or estimated, so "Quick" works for recipes without times too.
    totalMinutes: recipeTime(r)?.total ?? null,
    rating: r.rating,
    mealTypes: r.mealTypes.length ? r.mealTypes : inferMealTypes(r),
    isFavorite: r.isFavorite,
    isStaple: r.isStaple,
    stapleEveryWeeks: r.stapleEveryWeeks,
    lastPlannedOn: r.lastPlannedOn,
  };
}

export async function getPlan(householdId: string, weekStart: string): Promise<{ plan: MealPlan; meals: PlanMeal[] } | null> {
  const db = await getDb();
  const [plan] = await db
    .select()
    .from(schema.mealPlans)
    .where(and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)))
    .limit(1);
  if (!plan) return null;
  const meals = await db.select().from(schema.planMeals).where(eq(schema.planMeals.planId, plan.id)).orderBy(asc(schema.planMeals.position));
  return { plan, meals };
}

export async function planById(householdId: string, planId: string): Promise<MealPlan | null> {
  const db = await getDb();
  const [plan] = await db
    .select()
    .from(schema.mealPlans)
    .where(and(eq(schema.mealPlans.id, planId), eq(schema.mealPlans.householdId, householdId)))
    .limit(1);
  return plan ?? null;
}

/** A meal row, but only if it belongs to this household. */
export async function mealForHousehold(householdId: string, mealId: string): Promise<{ meal: PlanMeal; plan: MealPlan } | null> {
  const db = await getDb();
  const [row] = await db
    .select({ meal: schema.planMeals, plan: schema.mealPlans })
    .from(schema.planMeals)
    .innerJoin(schema.mealPlans, eq(schema.mealPlans.id, schema.planMeals.planId))
    .where(and(eq(schema.planMeals.id, mealId), eq(schema.mealPlans.householdId, householdId)))
    .limit(1);
  return row ?? null;
}

/**
 * What actually gets cooked: each meal with a recipe, with dinners cooked bigger when lunches
 * are planned as their leftovers.
 */
export function plannedRecipes(meals: PlanMeal[], recipesById: Map<string, Recipe>, people: number, skipMealId?: string): PlannedRecipe[] {
  const extra = new Map<string, number>();
  for (const m of meals) {
    if (m.leftoverOfId && m.id !== skipMealId) extra.set(m.leftoverOfId, (extra.get(m.leftoverOfId) ?? 0) + (m.servings ?? people));
  }
  const out: PlannedRecipe[] = [];
  for (const m of meals) {
    if (m.id === skipMealId || !m.recipeId) continue;
    const r = recipesById.get(m.recipeId);
    if (!r) continue;
    out.push({
      recipe: { id: r.id, title: r.title, servings: r.servings, ingredients: r.ingredients },
      servings: (m.servings ?? people) + (extra.get(m.id) ?? 0),
    });
  }
  return out;
}

export async function pantryOverrides(householdId: string): Promise<{ keys: Set<string>; excluded: Set<string> }> {
  const db = await getDb();
  const rows = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.householdId, householdId));
  return {
    keys: new Set(rows.filter((r) => r.onHand).map((r) => r.key)),
    excluded: new Set(rows.filter((r) => !r.onHand).map((r) => r.key)),
  };
}

/** Lay out a fresh week from the planning questions, filling it with recommendations. */
export async function createWeek(opts: {
  householdId: string;
  weekStart: string;
  request: WeekRequestJson;
  store: "walmart" | "sams";
  today: string;
}) {
  const { householdId, weekStart, request, store } = opts;
  const db = await getDb();
  const recipes = await householdRecipes(householdId);
  const candidates = recipes.map(toCandidate);
  const { keys: pantryKeys } = await pantryOverrides(householdId);

  type Draft = { mealType: MealType; day: number | null; leftoverOf: number | null; position: number };
  const drafts: Draft[] = [];
  const spread = (n: number) => Array.from({ length: n }, (_, i) => (n >= 7 ? i % 7 : Math.round((i * 7) / Math.max(n, 1)) % 7));
  const dinnerDays = spread(request.dinners);
  dinnerDays.forEach((day, i) => drafts.push({ mealType: "dinner", day, leftoverOf: null, position: i }));
  const leftoverCount = Math.min(request.leftoverLunches, request.lunches, request.dinners);
  const lunchDays = spread(request.lunches);
  for (let i = 0; i < request.lunches; i++) {
    const leftoverOf = i < leftoverCount ? i : null;
    const day = leftoverOf !== null ? Math.min(6, dinnerDays[leftoverOf] + 1) : lunchDays[i];
    drafts.push({ mealType: "lunch", day, leftoverOf, position: 100 + i });
  }
  spread(request.breakfasts).forEach((day, i) => drafts.push({ mealType: "breakfast", day, leftoverOf: null, position: 200 + i }));

  const slots: Slot[] = drafts.map((d, index) => ({
    index,
    mealType: d.mealType,
    recipeId: null,
    servings: request.people,
    locked: d.leftoverOf !== null,
  }));
  // Dinners with leftover lunches are cooked bigger; rank them with that in mind.
  for (const d of drafts) if (d.leftoverOf !== null) slots[d.leftoverOf].servings! += request.people;

  // Requested meals go on the plan first; ideas in words steer the recommendations.
  const requests = await openRequests(householdId, weekStart);
  const placed: string[] = [];
  for (const r of requests) {
    const recipe = r.recipeId ? candidates.find((c) => c.id === r.recipeId) : undefined;
    if (!recipe || slots.some((s) => s.recipeId === recipe.id)) continue;
    const slot = slots.find((s) => !s.recipeId && !s.locked && fitsSlot(recipe.mealTypes, s.mealType) === 1) ?? slots.find((s) => !s.recipeId && !s.locked && fitsSlot(recipe.mealTypes, s.mealType) > 0);
    if (!slot) continue;
    slot.recipeId = recipe.id;
    placed.push(r.id);
  }
  const ideas = requests.filter((r) => r.text).map((r) => r.text!);

  const picks = autoFill({
    slots,
    recipes: candidates,
    store,
    pantryKeys,
    request: { moods: request.moods, note: [request.note, ...ideas].filter(Boolean).join(", ") },
    includeDueStaples: request.includeStaples,
    today: new Date(`${opts.today}T12:00:00Z`),
  });

  let [plan] = await db
    .select()
    .from(schema.mealPlans)
    .where(and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)))
    .limit(1);
  if (plan) {
    await db.delete(schema.planMeals).where(eq(schema.planMeals.planId, plan.id));
    [plan] = await db.update(schema.mealPlans).set({ request, status: "draft", approvedAt: null }).where(eq(schema.mealPlans.id, plan.id)).returning();
  } else {
    [plan] = await db.insert(schema.mealPlans).values({ householdId, weekStart, request }).returning();
  }
  const ids = drafts.map(() => crypto.randomUUID());
  if (drafts.length) {
    await db.insert(schema.planMeals).values(
      drafts.map((d, i) => ({
        id: ids[i],
        planId: plan.id,
        mealType: d.mealType,
        position: d.position,
        day: d.day,
        recipeId: d.leftoverOf === null ? (picks.get(i) ?? slots[i].recipeId ?? null) : null,
        servings: request.people,
        leftoverOfId: d.leftoverOf === null ? null : ids[d.leftoverOf],
        note: d.leftoverOf === null ? null : "Leftovers",
      })),
    );
  }
  const used = [...placed, ...requests.filter((r) => r.text).map((r) => r.id)];
  if (used.length) await db.update(schema.mealRequests).set({ status: "planned", planId: plan.id }).where(inArray(schema.mealRequests.id, used));
  return plan;
}


/**
 * Build or refresh the grocery list for an approved plan. Items the household already marked
 * keep their marks; items no longer needed drop off; hand-added items stay.
 */
export async function buildListForPlan(householdId: string, plan: MealPlan, userName: string) {
  const db = await getDb();
  const meals = await db.select().from(schema.planMeals).where(eq(schema.planMeals.planId, plan.id));
  const recipeIds = [...new Set(meals.map((m) => m.recipeId).filter((x): x is string => Boolean(x)))];
  const recipes = recipeIds.length
    ? await db.select().from(schema.recipes).where(and(eq(schema.recipes.householdId, householdId), inArray(schema.recipes.id, recipeIds)))
    : [];
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const people = plan.request?.people ?? 4;
  const planned = plannedRecipes(meals, byId, people);
  const { keys: pantryKeys, excluded } = await pantryOverrides(householdId);
  const walmart = buildGroceryList(planned, "walmart", pantryKeys);
  const sams = new Map(buildGroceryList(planned, "sams", pantryKeys).map((l) => [l.key + "|" + l.needText, l]));

  const existing = await db.select().from(schema.groceryItems).where(eq(schema.groceryItems.planId, plan.id));
  const existingByKey = new Map(existing.filter((e) => !e.manual).map((e) => [e.key, e]));
  const keep = new Set<string>();
  for (const line of walmart) {
    const s = sams.get(line.key + "|" + line.needText);
    const pantry = line.pantry && !excluded.has(line.key);
    const values = {
      name: line.name,
      aisle: line.aisle,
      needText: line.needText,
      buyWalmart: line.buyText,
      buySams: s?.buyText ?? line.buyText,
      leftoverWalmart: line.leftover ? { text: line.leftover.text, waste: line.leftover.waste } : null,
      leftoverSams: s?.leftover ? { text: s.leftover.text, waste: s.leftover.waste } : null,
      sources: line.sources,
      pantry,
    };
    const prev = existingByKey.get(line.key);
    if (prev && !keep.has(prev.id)) {
      keep.add(prev.id);
      await db.update(schema.groceryItems).set(values).where(eq(schema.groceryItems.id, prev.id));
    } else {
      const [row] = await db
        .insert(schema.groceryItems)
        .values({ planId: plan.id, key: line.key, status: pantry ? "have" : "need", updatedBy: userName, ...values })
        .returning({ id: schema.groceryItems.id });
      keep.add(row.id);
    }
  }
  const stale = existing.filter((e) => !e.manual && !keep.has(e.id)).map((e) => e.id);
  if (stale.length) await db.delete(schema.groceryItems).where(inArray(schema.groceryItems.id, stale));

  // Remember when each recipe was last planned, for staples and variety.
  for (const r of recipes) {
    if (r.lastPlannedOn && r.lastPlannedOn >= plan.weekStart) continue;
    await db
      .update(schema.recipes)
      .set({ lastPlannedOn: plan.weekStart, timesPlanned: r.timesPlanned + 1 })
      .where(eq(schema.recipes.id, r.id));
  }
}

/** Requests still waiting: for this week, or for whenever. */
export async function openRequests(householdId: string, weekStart: string) {
  const db = await getDb();
  return db
    .select()
    .from(schema.mealRequests)
    .where(
      and(
        eq(schema.mealRequests.householdId, householdId),
        eq(schema.mealRequests.status, "open"),
        or(isNull(schema.mealRequests.weekStart), eq(schema.mealRequests.weekStart, weekStart)),
      ),
    )
    .orderBy(asc(schema.mealRequests.createdAt));
}

/** Requests whose recipe is now on a plan are done. */
export async function markRequestsPlanned(householdId: string, planId: string, weekStart: string, recipeIds: string[]) {
  if (!recipeIds.length) return;
  const db = await getDb();
  const open = (await openRequests(householdId, weekStart)).filter((r) => r.recipeId && recipeIds.includes(r.recipeId));
  if (open.length) await db.update(schema.mealRequests).set({ status: "planned", planId }).where(inArray(schema.mealRequests.id, open.map((r) => r.id)));
}

export function catalogName(key: string): string | null {
  return CATALOG_BY_KEY.get(key)?.name ?? null;
}

export { addDays };
