"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { isIsoDate } from "@/lib/dates";
import { inferMealTypes } from "@/lib/moods";
import { requireViewer } from "@/server/auth";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const Request = z.object({
  recipeId: z.string().max(64).nullable(),
  text: z.string().trim().max(200).nullable(),
  requestedBy: z.string().trim().max(40).nullable(),
  weekStart: z.string().nullable(),
});

/** "Can we have …?" — a recipe from the library, or an idea in words. */
export async function requestMeal(input: z.input<typeof Request>): Promise<Result<null>> {
  const viewer = await requireViewer();
  const parsed = Request.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the request." };
  const { recipeId, text, requestedBy, weekStart } = parsed.data;
  if (!recipeId && !text) return { ok: false, error: "Pick a recipe or describe what you'd like." };
  if (weekStart !== null && !isIsoDate(weekStart)) return { ok: false, error: "Pick a week." };
  const db = await getDb();
  if (recipeId) {
    const [r] = await db
      .select({ id: schema.recipes.id })
      .from(schema.recipes)
      .where(and(eq(schema.recipes.id, recipeId), eq(schema.recipes.householdId, viewer.household.id)))
      .limit(1);
    if (!r) return { ok: false, error: "Recipe not found." };
  }
  await db.insert(schema.mealRequests).values({
    householdId: viewer.household.id,
    recipeId,
    text: recipeId ? null : text,
    requestedBy: requestedBy || null,
    weekStart,
  });
  revalidatePath("/week");
  return { ok: true, value: null };
}

async function ownRequest(id: string) {
  const viewer = await requireViewer();
  const db = await getDb();
  const [r] = await db
    .select()
    .from(schema.mealRequests)
    .where(and(eq(schema.mealRequests.id, id), eq(schema.mealRequests.householdId, viewer.household.id)))
    .limit(1);
  return { viewer, db, request: r ?? null };
}

export async function dismissRequest(id: string): Promise<Result<null>> {
  const { db, request } = await ownRequest(id);
  if (!request) return { ok: true, value: null };
  await db.update(schema.mealRequests).set({ status: "dismissed" }).where(eq(schema.mealRequests.id, id));
  revalidatePath("/week");
  return { ok: true, value: null };
}

/** Put a requested recipe on a week's plan. */
export async function planRequest(id: string, weekStart: string): Promise<Result<null>> {
  const { viewer, db, request } = await ownRequest(id);
  if (!request?.recipeId) return { ok: false, error: "That request has no recipe to add." };
  if (!isIsoDate(weekStart)) return { ok: false, error: "Pick a week." };
  const [recipe] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, request.recipeId)).limit(1);
  if (!recipe) return { ok: false, error: "Recipe not found." };
  let [plan] = await db
    .select()
    .from(schema.mealPlans)
    .where(and(eq(schema.mealPlans.householdId, viewer.household.id), eq(schema.mealPlans.weekStart, weekStart)))
    .limit(1);
  if (!plan) [plan] = await db.insert(schema.mealPlans).values({ householdId: viewer.household.id, weekStart }).returning();
  else if (plan.status === "approved") await db.update(schema.mealPlans).set({ status: "draft" }).where(eq(schema.mealPlans.id, plan.id));
  const types = recipe.mealTypes.length ? recipe.mealTypes : inferMealTypes(recipe);
  const mealType = (types.includes("dinner") ? "dinner" : (types[0] ?? "dinner")) as "breakfast" | "lunch" | "dinner";
  const meals = await db.select().from(schema.planMeals).where(eq(schema.planMeals.planId, plan.id));
  // Fill an empty slot of the right kind if there is one; otherwise add a meal.
  const empty = meals.find((m) => m.mealType === mealType && !m.recipeId && !m.leftoverOfId);
  if (empty) await db.update(schema.planMeals).set({ recipeId: recipe.id }).where(eq(schema.planMeals.id, empty.id));
  else
    await db.insert(schema.planMeals).values({
      planId: plan.id,
      mealType,
      position: meals.reduce((m, x) => Math.max(m, x.position), 0) + 1,
      recipeId: recipe.id,
      servings: plan.request?.people ?? viewer.household.settings.people,
    });
  await db.update(schema.mealRequests).set({ status: "planned", planId: plan.id }).where(eq(schema.mealRequests.id, id));
  revalidatePath("/week");
  return { ok: true, value: null };
}
