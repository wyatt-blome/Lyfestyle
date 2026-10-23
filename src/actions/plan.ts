"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import type { MealPlan } from "@/db/schema";
import { isIsoDate, todayIn } from "@/lib/dates";
import { recipeImageSrc } from "@/lib/images";
import type { MealType } from "@/lib/moods";
import { rankForSlot } from "@/lib/planner";
import { requireViewer } from "@/server/auth";
import { buildListForPlan, createWeek, householdRecipes, mealForHousehold, pantryOverrides, planById, plannedRecipes, toCandidate } from "@/server/data";

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

export async function planWeek(weekStart: string, request: z.input<typeof Request>): Promise<Result<null>> {
  const viewer = await requireViewer();
  if (!isIsoDate(weekStart)) return { ok: false, error: "Pick a week." };
  const parsed = Request.safeParse(request);
  if (!parsed.success) return { ok: false, error: "Check the meal counts." };
  if (parsed.data.breakfasts + parsed.data.lunches + parsed.data.dinners === 0) return { ok: false, error: "Plan at least one meal." };
  await createWeek({
    householdId: viewer.household.id,
    weekStart,
    request: parsed.data,
    store: viewer.household.settings.store,
    today: todayIn(viewer.household.settings.timeZone),
  });
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
        totalMinutes: r.totalMinutes,
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
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, viewer.household.id)))
    .limit(1);
  if (!recipe) return { ok: false, error: "Recipe not found." };
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
  await db
    .update(schema.mealPlans)
    .set({ status: "approved", approvedAt: new Date(), approvedBy: viewer.user.name })
    .where(eq(schema.mealPlans.id, plan.id));
  revalidatePath("/week");
  revalidatePath("/list");
  return { ok: true, value: { weekStart: plan.weekStart } };
}
