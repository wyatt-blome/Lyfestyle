"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { MealPlan, PlanUndo } from "@/db/schema";
import { isIsoDate, todayIn } from "@/lib/dates";
import { recipeImageSrc } from "@/lib/images";
import { recipeTime } from "@/lib/time";
import type { MealType } from "@/lib/moods";
import { rankForSlot } from "@/lib/planner";
import { requireViewer } from "@/server/auth";
import { buildListForPlan, createWeek, markRequestsPlanned, householdRecipes, mealForHousehold, pantryOverrides, planById, plannedRecipes, toCandidate } from "@/server/data";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const Request = z.object({
  breakfasts: z.number().int().min(0).max(14),
  lunches: z.number().int().min(0).max(14),
  dinners: z.number().int().min(0).max(14),
  leftoverLunches: z.number().int().min(0).max(14),
  people: z.number().int().min(1).max(30),
  moods: z.array(z.string().max(30)).max(20),
  note: z.string().max(300),
  includeStaples: z.boolean(),
});

/** Meals on a week's plan that a re-plan can keep (not leftovers, not empty). */
async function plannedMeals(householdId: string, weekStart: string) {
  const db = await getDb();
  const [plan] = await db
    .select()
    .from(schema.mealPlans)
    .where(and(eq(schema.mealPlans.householdId, householdId), eq(schema.mealPlans.weekStart, weekStart)))
    .limit(1);
  if (!plan) return { plan: null, meals: [] };
  const meals = await db.select().from(schema.planMeals).where(eq(schema.planMeals.planId, plan.id)).orderBy(asc(schema.planMeals.position));
  return { plan, meals: meals.filter((m) => m.recipeId && !m.leftoverOfId).map((m) => ({ mealType: m.mealType as MealType, recipeId: m.recipeId! })) };
}

/**
 * Plan a week from the household's answers. With `keepMeals`, meals already on the plan stay
 * (as many as the new counts allow) and only the rest are filled in.
 */
export async function planWeek(weekStart: string, request: z.input<typeof Request>, keepMeals = false): Promise<Result<null>> {
  const viewer = await requireViewer();
  if (!isIsoDate(weekStart)) return { ok: false, error: "Pick a week." };
  const parsed = Request.safeParse(request);
  if (!parsed.success) return { ok: false, error: "Check the meal counts." };
  if (parsed.data.breakfasts + parsed.data.lunches + parsed.data.dinners === 0) return { ok: false, error: "Plan at least one meal." };
  const before = await plannedMeals(viewer.household.id, weekStart);
  if (before.plan) await saveUndo(before.plan.id, "Changed the week's meals and mood");
  await createWeek({
    householdId: viewer.household.id,
    weekStart,
    request: parsed.data,
    store: viewer.household.settings.store,
    today: todayIn(viewer.household.settings.timeZone),
    keep: keepMeals ? before.meals : [],
  });
  revalidatePath("/week");
  return { ok: true, value: null };
}

/** Same answers, different meals: everything is re-picked except meals someone asked for. */
export async function newSuggestions(weekStart: string): Promise<Result<null>> {
  const viewer = await requireViewer();
  if (!isIsoDate(weekStart)) return { ok: false, error: "Pick a week." };
  const { plan, meals } = await plannedMeals(viewer.household.id, weekStart);
  if (!plan) return { ok: false, error: "Plan the week first." };
  const { settings } = viewer.household;
  const count = (t: MealType) => meals.filter((m) => m.mealType === t).length;
  const request = plan.request ?? {
    breakfasts: count("breakfast"),
    lunches: count("lunch"),
    dinners: count("dinner"),
    leftoverLunches: 0,
    people: settings.people,
    moods: [],
    note: "",
    includeStaples: true,
  };
  if (request.breakfasts + request.lunches + request.dinners === 0) return { ok: false, error: "Add a meal first." };
  const db = await getDb();
  const asked = await db
    .select({ recipeId: schema.mealRequests.recipeId })
    .from(schema.mealRequests)
    .where(and(eq(schema.mealRequests.planId, plan.id), eq(schema.mealRequests.status, "planned")));
  const askedIds = new Set(asked.map((r) => r.recipeId));
  await saveUndo(plan.id, "Picked new suggestions");
  await createWeek({
    householdId: viewer.household.id,
    weekStart,
    request,
    store: settings.store,
    today: todayIn(settings.timeZone),
    keep: meals.filter((m) => askedIds.has(m.recipeId)),
    avoid: meals.filter((m) => !askedIds.has(m.recipeId)).map((m) => m.recipeId),
  });
  revalidatePath("/week");
  return { ok: true, value: null };
}

/** Remember the plan as it is now, so the change about to be made can be undone. */
async function saveUndo(planId: string, label: string) {
  const db = await getDb();
  const [plan] = await db.select().from(schema.mealPlans).where(eq(schema.mealPlans.id, planId)).limit(1);
  if (!plan) return;
  const meals = await db.select().from(schema.planMeals).where(eq(schema.planMeals.planId, planId));
  const undo: PlanUndo = {
    label,
    request: plan.request,
    status: plan.status,
    approvedAt: plan.approvedAt?.toISOString() ?? null,
    meals: meals.map((m) => ({
      id: m.id,
      mealType: m.mealType,
      position: m.position,
      day: m.day,
      recipeId: m.recipeId,
      servings: m.servings,
      leftoverOfId: m.leftoverOfId,
      note: m.note,
    })),
  };
  await db.update(schema.mealPlans).set({ undo }).where(eq(schema.mealPlans.id, planId));
}

/** Put the plan back the way it was before its last change. */
export async function undoPlanChange(planId: string): Promise<Result<{ label: string }>> {
  const viewer = await requireViewer();
  const plan = await planById(viewer.household.id, planId);
  if (!plan?.undo) return { ok: false, error: "There's nothing to undo." };
  const { undo } = plan;
  const db = await getDb();
  // A recipe deleted since then can't come back onto the plan.
  const ids = [...new Set(undo.meals.map((m) => m.recipeId).filter((x): x is string => Boolean(x)))];
  const alive = new Set(
    ids.length
      ? (await db.select({ id: schema.recipes.id }).from(schema.recipes).where(and(eq(schema.recipes.householdId, viewer.household.id), inArray(schema.recipes.id, ids)))).map((r) => r.id)
      : [],
  );
  await db.delete(schema.planMeals).where(eq(schema.planMeals.planId, plan.id));
  if (undo.meals.length) {
    await db.insert(schema.planMeals).values(undo.meals.map((m) => ({ ...m, planId: plan.id, recipeId: m.recipeId && alive.has(m.recipeId) ? m.recipeId : null })));
  }
  await db
    .update(schema.mealPlans)
    .set({ request: undo.request, status: undo.status, approvedAt: undo.approvedAt ? new Date(undo.approvedAt) : null, undo: null })
    .where(eq(schema.mealPlans.id, plan.id));
  revalidatePath("/week");
  return { ok: true, value: { label: undo.label } };
}

/** Hide the undo button without undoing. */
export async function dismissUndo(planId: string): Promise<Result<null>> {
  const viewer = await requireViewer();
  const plan = await planById(viewer.household.id, planId);
  if (plan) await (await getDb()).update(schema.mealPlans).set({ undo: null }).where(eq(schema.mealPlans.id, plan.id));
  revalidatePath("/week");
  return { ok: true, value: null };
}

async function markChanged(plan: MealPlan) {
  if (plan.status !== "approved") return;
  const db = await getDb();
  await db.update(schema.mealPlans).set({ status: "draft" }).where(eq(schema.mealPlans.id, plan.id));
}

export interface SwapOption {
  id: string;
  title: string;
  imageUrl: string | null;
  totalMinutes: number | null;
  timeEstimated: boolean;
  rating: number | null;
  isFavorite: boolean;
  isStaple: boolean;
  reasons: string[];
  wasteDelta: number;
}

/** Ranked alternatives for one meal of the week. */
export async function swapOptions(mealId: string): Promise<Result<SwapOption[]>> {
  const viewer = await requireViewer();
  const found = await mealForHousehold(viewer.household.id, mealId);
  if (!found) return { ok: false, error: "That meal is no longer on the plan." };
  const db = await getDb();
  const meals = await db.select().from(schema.planMeals).where(eq(schema.planMeals.planId, found.plan.id));
  const recipes = await householdRecipes(viewer.household.id);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const people = found.plan.request?.people ?? viewer.household.settings.people;
  const others = plannedRecipes(meals, byId, people, mealId);
  const extra = meals.filter((m) => m.leftoverOfId === mealId).reduce((n, m) => n + (m.servings ?? people), 0);
  const { keys } = await pantryOverrides(viewer.household.id);
  const ranked = rankForSlot({
    others,
    candidates: recipes.map(toCandidate),
    servings: (found.meal.servings ?? people) + extra,
    mealType: found.meal.mealType as MealType,
    request: found.plan.request ? { moods: found.plan.request.moods, note: found.plan.request.note } : undefined,
    store: viewer.household.settings.store,
    pantryKeys: keys,
    today: new Date(`${todayIn(viewer.household.settings.timeZone)}T12:00:00Z`),
    // Meals already on the week aren't offered again; search still finds them.
    excludeIds: new Set(meals.map((m) => m.recipeId).filter((x): x is string => Boolean(x))),
  });
  return {
    ok: true,
    value: ranked.slice(0, 24).map((s) => {
      const r = byId.get(s.recipe.id)!;
      return {
        id: r.id,
        title: r.title,
        imageUrl: recipeImageSrc(r),
        totalMinutes: recipeTime(r)?.total ?? null,
        timeEstimated: recipeTime(r)?.estimated ?? false,
        rating: r.rating,
        isFavorite: r.isFavorite,
        isStaple: r.isStaple,
        reasons: s.reasons.filter((x) => x !== "Already this week"),
        wasteDelta: Math.round(s.wasteDelta * 100) / 100,
      };
    }),
  };
}

export async function swapMeal(mealId: string, recipeId: string): Promise<Result<null>> {
  const viewer = await requireViewer();
  const found = await mealForHousehold(viewer.household.id, mealId);
  if (!found) return { ok: false, error: "That meal is no longer on the plan." };
  const db = await getDb();
  const [recipe] = await db
    .select({ id: schema.recipes.id, title: schema.recipes.title })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, viewer.household.id)))
    .limit(1);
  if (!recipe) return { ok: false, error: "Recipe not found." };
  await saveUndo(found.plan.id, `Swapped in ${recipe.title}`);
  await db.update(schema.planMeals).set({ recipeId, leftoverOfId: null, note: null }).where(eq(schema.planMeals.id, mealId));
  await markChanged(found.plan);
  revalidatePath("/week");
  return { ok: true, value: null };
}

export async function updateMeal(mealId: string, patch: { day?: number | null; servings?: number; leftoverOfId?: string | null }): Promise<Result<null>> {
  const viewer = await requireViewer();
  const found = await mealForHousehold(viewer.household.id, mealId);
  if (!found) return { ok: false, error: "That meal is no longer on the plan." };
  const set: Partial<typeof schema.planMeals.$inferInsert> = {};
  if (patch.day !== undefined) set.day = patch.day === null ? null : Math.max(0, Math.min(6, Math.round(patch.day)));
  if (patch.servings !== undefined) set.servings = Math.max(1, Math.min(40, Math.round(patch.servings)));
  if (patch.leftoverOfId !== undefined) {
    if (patch.leftoverOfId) {
      const dinner = await mealForHousehold(viewer.household.id, patch.leftoverOfId);
      if (!dinner || dinner.plan.id !== found.plan.id || dinner.meal.leftoverOfId) return { ok: false, error: "Pick a meal from this week." };
      set.recipeId = null;
      set.note = "Leftovers";
    } else {
      set.note = null;
    }
    set.leftoverOfId = patch.leftoverOfId;
  }
  await saveUndo(
    found.plan.id,
    patch.leftoverOfId !== undefined ? "Changed a leftovers meal" : patch.servings !== undefined ? "Changed servings" : "Moved a meal to another day",
  );
  const db = await getDb();
  await db.update(schema.planMeals).set(set).where(eq(schema.planMeals.id, mealId));
  await markChanged(found.plan);
  revalidatePath("/week");
  return { ok: true, value: null };
}

export async function removeMeal(mealId: string): Promise<Result<null>> {
  const viewer = await requireViewer();
  const found = await mealForHousehold(viewer.household.id, mealId);
  if (!found) return { ok: true, value: null };
  const db = await getDb();
  // Lunches planned as this meal's leftovers go with it.
  const dependents = await db.select({ id: schema.planMeals.id }).from(schema.planMeals).where(eq(schema.planMeals.leftoverOfId, mealId));
  const ids = [mealId, ...dependents.map((d) => d.id)];
  const [gone] = found.meal.recipeId
    ? await db.select({ title: schema.recipes.title }).from(schema.recipes).where(eq(schema.recipes.id, found.meal.recipeId)).limit(1)
    : [];
  await saveUndo(found.plan.id, gone ? `Removed ${gone.title}` : `Removed a ${found.meal.mealType}`);
  await db.delete(schema.planMeals).where(inArray(schema.planMeals.id, ids));
  await markChanged(found.plan);
  revalidatePath("/week");
  return { ok: true, value: null };
}

/** Add another meal of a type; it starts with the best recommendation. */
export async function addMeal(planId: string, mealType: MealType): Promise<Result<null>> {
  const viewer = await requireViewer();
  const plan = await planById(viewer.household.id, planId);
  if (!plan) return { ok: false, error: "Plan not found." };
  const db = await getDb();
  const meals = await db.select().from(schema.planMeals).where(eq(schema.planMeals.planId, plan.id));
  const recipes = await householdRecipes(viewer.household.id);
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const people = plan.request?.people ?? viewer.household.settings.people;
  const { keys } = await pantryOverrides(viewer.household.id);
  const best = rankForSlot({
    others: plannedRecipes(meals, byId, people),
    candidates: recipes.map(toCandidate),
    servings: people,
    mealType,
    request: plan.request ? { moods: plan.request.moods, note: plan.request.note } : undefined,
    store: viewer.household.settings.store,
    pantryKeys: keys,
    excludeIds: new Set(meals.map((m) => m.recipeId).filter((x): x is string => Boolean(x))),
  })[0];
  const base = mealType === "dinner" ? 0 : mealType === "lunch" ? 100 : 200;
  const position = meals.filter((m) => m.mealType === mealType).reduce((mx, m) => Math.max(mx, m.position), base - 1) + 1;
  await saveUndo(plan.id, `Added ${best ? best.recipe.title : `a ${mealType}`}`);
  await db.insert(schema.planMeals).values({ planId: plan.id, mealType, position, recipeId: best?.recipe.id ?? null, servings: people });
  await markChanged(plan);
  revalidatePath("/week");
  return { ok: true, value: null };
}

export async function approvePlan(planId: string): Promise<Result<{ weekStart: string }>> {
  const viewer = await requireViewer();
  const plan = await planById(viewer.household.id, planId);
  if (!plan) return { ok: false, error: "Plan not found." };
  const db = await getDb();
  const meals = await db.select().from(schema.planMeals).where(eq(schema.planMeals.planId, plan.id));
  if (!meals.some((m) => m.recipeId)) return { ok: false, error: "Add at least one meal before approving." };
  await buildListForPlan(viewer.household.id, plan, viewer.user.name);
  await markRequestsPlanned(viewer.household.id, plan.id, plan.weekStart, meals.map((m) => m.recipeId).filter((x): x is string => Boolean(x)));
  await db
    .update(schema.mealPlans)
    .set({ status: "approved", approvedAt: new Date(), approvedBy: viewer.user.name, undo: null })
    .where(eq(schema.mealPlans.id, plan.id));
  revalidatePath("/week");
  revalidatePath("/list");
  return { ok: true, value: { weekStart: plan.weekStart } };
}
