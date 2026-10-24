"use server";

import { and, asc, eq, inArray, isNotNull, notInArray, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { aiAvailable, AiError, extractRecipeFromImage } from "@/lib/import/ai";
import { buildGroups, type PagePart, type RecipePart } from "@/lib/import/pages";
import { looksLikeBadTitle } from "@/lib/import/title";
import { readPageOnce } from "@/server/photos";
import { FetchError } from "@/lib/import/fetch";
import { importFromUrl, listBoardPins, type ImportResult } from "@/lib/import/importUrl";
import type { ImportedRecipe } from "@/lib/import/types";
import { tidyTitle } from "@/lib/ingredients/names";
import { inferMealTypes } from "@/lib/moods";
import { requireViewer } from "@/server/auth";
import { currentWeekStart } from "@/server/data";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof FetchError || e instanceof AiError) return { ok: false, error: e.message };
  console.error(e);
  return { ok: false, error: "Something went wrong. Try again." };
}

export async function importLink(url: string): Promise<Result<ImportResult>> {
  await requireViewer();
  try {
    return { ok: true, value: await importFromUrl(url) };
  } catch (e) {
    return failure(e);
  }
}

export async function importPhoto(base64: string, mediaType: string): Promise<Result<ImportedRecipe>> {
  await requireViewer();
  const type = z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]).safeParse(mediaType);
  if (!type.success) return { ok: false, error: "Use a JPEG or PNG photo." };
  if (base64.length > 6_500_000) return { ok: false, error: "That photo is too large." };
  try {
    return { ok: true, value: await extractRecipeFromImage({ base64, mediaType: type.data }) };
  } catch (e) {
    return failure(e);
  }
}

/**
 * One photographed page read by Claude; the browser groups pages into recipes. `hash` is the
 * original photo's fingerprint, so a photo added twice is only ever read once.
 */
export async function readPhotoPage(base64: string, mediaType: string, hash?: string): Promise<Result<RecipePart[]>> {
  const viewer = await requireViewer();
  const type = z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]).safeParse(mediaType);
  if (!type.success) return { ok: false, error: "Use a JPEG or PNG photo." };
  if (base64.length > 4_000_000) return { ok: false, error: "That photo is too large." };
  try {
    return { ok: true, value: await readPageOnce(viewer.household.id, { base64, mediaType: type.data }, hash) };
  } catch (e) {
    return failure(e);
  }
}

const FileRecipe = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullish(),
  servings: z.number().int().min(1).max(100).nullish(),
  prepMinutes: z.number().int().min(0).max(10000).nullish(),
  cookMinutes: z.number().int().min(0).max(10000).nullish(),
  ingredients: z.array(z.string().max(300)).max(150).default([]),
  steps: z.array(z.string().max(3000)).max(100).default([]),
  tags: z.array(z.string().max(30)).max(20).default([]),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner"])).max(3).default([]),
  notes: z.string().max(5000).nullish(),
  sourceUrl: z.string().url().max(2000).nullish(),
  isFavorite: z.boolean().default(false),
  rating: z.number().int().min(1).max(5).nullish(),
});

/**
 * Bring in a recipe file (JSON: { "recipes": [...] }), e.g. one prepared from a stack of photos.
 * Recipes whose name is already in the library are skipped.
 */
export async function importRecipeFile(json: string): Promise<Result<{ added: number; skipped: string[]; invalid: number }>> {
  const viewer = await requireViewer();
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: "That file isn't a recipe file (it isn't valid JSON)." };
  }
  const list = Array.isArray(data) ? data : (data as { recipes?: unknown })?.recipes;
  if (!Array.isArray(list) || !list.length) return { ok: false, error: "No recipes found in that file." };
  if (list.length > 2000) return { ok: false, error: "That file has too many recipes; split it into smaller files." };
  const db = await getDb();
  const existing = new Set(
    (await db.select({ title: schema.recipes.title }).from(schema.recipes).where(eq(schema.recipes.householdId, viewer.household.id))).map((r) =>
      r.title.trim().toLowerCase(),
    ),
  );
  let added = 0;
  let invalid = 0;
  const skipped: string[] = [];
  for (const raw of list) {
    const parsed = FileRecipe.safeParse(raw);
    if (!parsed.success) {
      invalid++;
      continue;
    }
    const r = parsed.data;
    if (existing.has(r.title.trim().toLowerCase())) {
      skipped.push(r.title);
      continue;
    }
    const saved = await saveRecipe({
      title: tidyTitle(r.title),
      description: r.description ?? null,
      servings: r.servings ?? null,
      prepMinutes: r.prepMinutes ?? null,
      cookMinutes: r.cookMinutes ?? null,
      ingredients: r.ingredients,
      steps: r.steps,
      tags: r.tags,
      mealTypes: r.mealTypes,
      notes: r.notes ?? null,
      sourceUrl: r.sourceUrl ?? null,
      sourceType: "photo",
      isFavorite: r.isFavorite,
      rating: r.rating ?? null,
    });
    if (saved.ok) {
      added++;
      existing.add(r.title.trim().toLowerCase());
    } else invalid++;
  }
  revalidatePath("/recipes");
  return { ok: true, value: { added, skipped, invalid } };
}

export async function photoImportAvailable(): Promise<boolean> {
  await requireViewer();
  return aiAvailable();
}

export async function boardPins(url: string): Promise<Result<{ url: string; title: string }[]>> {
  await requireViewer();
  try {
    return { ok: true, value: await listBoardPins(url) };
  } catch (e) {
    return failure(e);
  }
}

const RecipeInput = z.object({
  title: z.string().trim().min(1, "Give the recipe a name.").max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  sourceUrl: z.string().trim().url().max(2000).nullable().optional().or(z.literal("")),
  pinterestUrl: z.string().trim().url().max(2000).nullable().optional().or(z.literal("")),
  sourceType: z.enum(["manual", "link", "pinterest", "photo", "text"]).default("manual"),
  imageUrl: z
    .string()
    .max(400_000)
    .refine((s) => /^(https?:|data:image\/(jpeg|png|webp);base64,)/.test(s), "Bad image")
    .nullable()
    .optional()
    .or(z.literal("")),
  servings: z.number().int().min(1).max(100).nullable().optional(),
  prepMinutes: z.number().int().min(0).max(10000).nullable().optional(),
  cookMinutes: z.number().int().min(0).max(10000).nullable().optional(),
  totalMinutes: z.number().int().min(0).max(10000).nullable().optional(),
  ingredients: z.array(z.string().trim().max(300)).max(150),
  steps: z.array(z.string().trim().max(3000)).max(100),
  tags: z.array(z.string().trim().toLowerCase().max(30)).max(20),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner"])).max(3),
  notes: z.string().max(5000).nullable().optional(),
  isFavorite: z.boolean().default(false),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  readWith: z.enum(["phone", "claude"]).nullable().optional(),
  isStaple: z.boolean().default(false),
  stapleEveryWeeks: z.number().int().min(1).max(12).nullable().optional(),
});
export type RecipeInput = z.input<typeof RecipeInput>;

function clean(input: z.output<typeof RecipeInput>) {
  const total = input.totalMinutes ?? (input.prepMinutes || input.cookMinutes ? (input.prepMinutes ?? 0) + (input.cookMinutes ?? 0) : null);
  return {
    ...input,
    description: input.description || null,
    sourceUrl: input.sourceUrl || null,
    pinterestUrl: input.pinterestUrl || null,
    imageUrl: input.imageUrl || null,
    totalMinutes: total,
    ingredients: input.ingredients.filter(Boolean),
    steps: input.steps.filter(Boolean),
    tags: [...new Set(input.tags.filter(Boolean))],
    mealTypes: input.mealTypes.length ? input.mealTypes : inferMealTypes({ title: input.title, tags: input.tags }),
    stapleEveryWeeks: input.isStaple ? (input.stapleEveryWeeks ?? 1) : null,
    notes: input.notes || null,
  };
}

const Photos = z.array(z.string().max(1_600_000).regex(/^data:image\/(jpeg|png|webp);base64,/)).max(8);

/** Save a recipe. `photos` (new recipes only) are the original pages it was read from. */
export async function saveRecipe(input: RecipeInput, id?: string, photos: string[] = [], photoHashes: string[] = []): Promise<Result<{ id: string }>> {
  const viewer = await requireViewer();
  const parsed = RecipeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the recipe." };
  const values = clean(parsed.data);
  const db = await getDb();
  if (id) {
    // Saving in the editor confirms the name as it stands.
    const [row] = await db
      .update(schema.recipes)
      .set({ ...values, updatedAt: new Date(), titleByHand: true })
      .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, viewer.household.id)))
      .returning({ id: schema.recipes.id });
    if (!row) return { ok: false, error: "Recipe not found." };
    revalidatePath("/recipes");
    return { ok: true, value: row };
  }
  const [row] = await db
    .insert(schema.recipes)
    .values({ ...values, householdId: viewer.household.id, createdBy: viewer.user.name })
    .returning({ id: schema.recipes.id });
  const pages = Photos.safeParse(photos);
  if (pages.success && pages.data.length) {
    await db.insert(schema.recipePhotos).values(pages.data.map((data, position) => ({ recipeId: row.id, position, data })));
  }
  // Remember the photos as imported, so picking the same album again skips them.
  const hashes = photoHashes.filter((h) => /^[a-f0-9]{64}$/.test(h)).slice(0, 8);
  if (hashes.length) {
    await db
      .insert(schema.importedPhotos)
      .values(hashes.map((hash) => ({ householdId: viewer.household.id, hash, recipeId: row.id })))
      .onConflictDoNothing();
  }
  revalidatePath("/recipes");
  return { ok: true, value: row };
}

/** Which of these photo fingerprints have been imported before. */
export async function alreadyImported(hashes: string[]): Promise<string[]> {
  const viewer = await requireViewer();
  const valid = hashes.filter((h) => /^[a-f0-9]{64}$/.test(h)).slice(0, 2000);
  if (!valid.length) return [];
  const db = await getDb();
  const rows = await db
    .select({ hash: schema.importedPhotos.hash })
    .from(schema.importedPhotos)
    .where(and(eq(schema.importedPhotos.householdId, viewer.household.id), inArray(schema.importedPhotos.hash, valid)));
  return rows.map((r) => r.hash);
}

/**
 * Start over: delete every recipe in the household, with their photos and requests, and forget
 * which photos were imported so they can be imported again. Claude's saved readings are kept, so
 * re-importing the same photos costs nothing.
 */
export async function deleteAllRecipes(confirm: string): Promise<Result<{ deleted: number }>> {
  const viewer = await requireViewer();
  if (confirm.trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  const db = await getDb();
  const rows = await db.delete(schema.recipes).where(eq(schema.recipes.householdId, viewer.household.id)).returning({ id: schema.recipes.id });
  await db.delete(schema.importedPhotos).where(eq(schema.importedPhotos.householdId, viewer.household.id));
  revalidatePath("/", "layout");
  return { ok: true, value: { deleted: rows.length } };
}

/** Photo recipes saved before photos were tracked (the ones the old importer grouped wrongly). */
async function untrackedPhotoRecipes(householdId: string) {
  const db = await getDb();
  const tracked = db
    .select({ id: schema.importedPhotos.recipeId })
    .from(schema.importedPhotos)
    .where(and(eq(schema.importedPhotos.householdId, householdId), isNotNull(schema.importedPhotos.recipeId)));
  return db
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.householdId, householdId), eq(schema.recipes.sourceType, "photo"), notInArray(schema.recipes.id, tracked)));
}

export async function countOldPhotoImports(): Promise<number> {
  const viewer = await requireViewer();
  return (await untrackedPhotoRecipes(viewer.household.id)).length;
}

export async function deleteOldPhotoImports(): Promise<Result<{ deleted: number }>> {
  const viewer = await requireViewer();
  const old = await untrackedPhotoRecipes(viewer.household.id);
  if (!old.length) return { ok: true, value: { deleted: 0 } };
  const db = await getDb();
  await db.delete(schema.recipes).where(inArray(schema.recipes.id, old.map((r) => r.id)));
  revalidatePath("/recipes");
  return { ok: true, value: { deleted: old.length } };
}

/** Bulk import: fetch one link and save it straight away. Skips links already in the library. */
export async function importAndSave(
  url: string,
): Promise<Result<{ id: string; title: string; status: "complete" | "partial" | "duplicate"; message: string | null }>> {
  const viewer = await requireViewer();
  const db = await getDb();
  const trimmed = url.trim();
  const [dupe] = await db
    .select({ id: schema.recipes.id, title: schema.recipes.title })
    .from(schema.recipes)
    .where(
      and(
        eq(schema.recipes.householdId, viewer.household.id),
        or(eq(schema.recipes.sourceUrl, trimmed), eq(schema.recipes.pinterestUrl, trimmed)),
      ),
    )
    .limit(1);
  if (dupe) return { ok: true, value: { ...dupe, status: "duplicate", message: "Already in your recipes" } };
  try {
    const result = await importFromUrl(trimmed);
    const r = result.recipe;
    if (r.sourceUrl) {
      const [same] = await db
        .select({ id: schema.recipes.id, title: schema.recipes.title })
        .from(schema.recipes)
        .where(and(eq(schema.recipes.householdId, viewer.household.id), eq(schema.recipes.sourceUrl, r.sourceUrl)))
        .limit(1);
      if (same) return { ok: true, value: { ...same, status: "duplicate", message: "Already in your recipes" } };
    }
    const saved = await saveRecipe({
      title: r.title || "Untitled recipe",
      description: r.description?.slice(0, 2000) ?? null,
      sourceUrl: r.sourceUrl,
      pinterestUrl: result.pinterestUrl,
      sourceType: result.pinterestUrl ? "pinterest" : "link",
      imageUrl: r.imageUrl && r.imageUrl.length < 2000 ? r.imageUrl : null,
      servings: r.servings,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      totalMinutes: r.totalMinutes,
      ingredients: r.ingredients.slice(0, 150).map((s) => s.slice(0, 300)),
      steps: r.steps.slice(0, 100).map((s) => s.slice(0, 3000)),
      tags: r.tags.slice(0, 20).map((t) => t.slice(0, 30)),
      mealTypes: [],
    });
    if (!saved.ok) return saved;
    return { ok: true, value: { id: saved.value.id, title: r.title, status: result.status, message: result.message } };
  } catch (e) {
    return failure(e);
  }
}

async function ownRecipe(id: string) {
  const viewer = await requireViewer();
  const db = await getDb();
  const [r] = await db
    .select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, viewer.household.id)))
    .limit(1);
  return { viewer, db, recipe: r ?? null };
}

/** Rename several recipes at once (the "Name these recipes" screen). */
export async function renameRecipes(changes: { id: string; title: string }[]): Promise<Result<{ renamed: number }>> {
  const viewer = await requireViewer();
  const parsed = z.array(z.object({ id: z.string().max(64), title: z.string().trim().min(1).max(200) })).max(1000).safeParse(changes);
  if (!parsed.success) return { ok: false, error: "Every recipe needs a name." };
  const db = await getDb();
  let renamed = 0;
  for (const c of parsed.data) {
    const rows = await db
      .update(schema.recipes)
      // Renaming isn't editing: Claude may still fix the ingredients of an untouched recipe.
      .set({ title: c.title, titleByHand: true })
      .where(and(eq(schema.recipes.id, c.id), eq(schema.recipes.householdId, viewer.household.id)))
      .returning({ id: schema.recipes.id });
    renamed += rows.length;
  }
  revalidatePath("/recipes");
  return { ok: true, value: { renamed } };
}

/**
 * Read a photo recipe with Claude, once ever. Fixes a broken name, fills missing details, and
 * replaces ingredients and steps the phone misread, unless the household has edited the recipe.
 */
export async function readRecipeWithClaude(id: string): Promise<Result<{ title: string; changed: string[]; skipped: boolean }>> {
  const { viewer, db, recipe } = await ownRecipe(id);
  if (!recipe) return { ok: false, error: "Recipe not found." };
  if (recipe.readWith === "claude") return { ok: true, value: { title: recipe.title, changed: [], skipped: true } };
  if (!aiAvailable()) return { ok: false, error: "Claude reading isn't switched on. Add ANTHROPIC_API_KEY in the app's settings." };
  const stored = await db
    .select({ data: schema.recipePhotos.data })
    .from(schema.recipePhotos)
    .where(eq(schema.recipePhotos.recipeId, id))
    .orderBy(asc(schema.recipePhotos.position));
  const images = stored.length ? stored.map((p) => p.data) : recipe.imageUrl?.startsWith("data:") ? [recipe.imageUrl] : [];
  if (!images.length) return { ok: false, error: "No photo is saved with this recipe." };
  try {
    const parts: PagePart[] = [];
    for (const [page, data] of images.entries()) {
      const m = data.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!m) continue;
      const read = await readPageOnce(viewer.household.id, { base64: m[2], mediaType: m[1] as "image/jpeg" });
      parts.push(...read.map((p) => ({ ...p, page })));
    }
    // All pages belong to this one recipe.
    const [group] = buildGroups(parts, parts.map((_, i) => i === 0));
    const r = group?.recipe;
    const changed: string[] = [];
    const set: Partial<typeof schema.recipes.$inferInsert> = { readWith: "claude" };
    if (r) {
      const untouched = recipe.updatedAt.getTime() - recipe.createdAt.getTime() < 10_000;
      // A name someone typed is kept; names the phone read are replaced.
      if (r.title && r.title !== "Untitled recipe" && (looksLikeBadTitle(recipe.title) || !recipe.titleByHand)) {
        set.title = r.title;
        changed.push("name");
      }
      if (r.ingredients.length && (!recipe.ingredients.length || untouched)) {
        set.ingredients = r.ingredients;
        changed.push("ingredients");
      }
      if (r.steps.length && (!recipe.steps.length || untouched)) {
        set.steps = r.steps;
        changed.push("steps");
      }
      if (!recipe.servings && r.servings) set.servings = r.servings;
      if (!recipe.prepMinutes && !recipe.cookMinutes && (r.prepMinutes || r.cookMinutes)) {
        set.prepMinutes = r.prepMinutes;
        set.cookMinutes = r.cookMinutes;
        set.totalMinutes = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
      }
      if (!recipe.tags.length && r.tags.length) set.tags = r.tags.slice(0, 8);
    }
    await db.update(schema.recipes).set(set).where(eq(schema.recipes.id, id));
    revalidatePath("/recipes");
    revalidatePath(`/recipes/${id}`);
    return { ok: true, value: { title: set.title ?? recipe.title, changed, skipped: false } };
  } catch (e) {
    return failure(e);
  }
}

/**
 * Split a recipe whose photos are really several recipes. `starts` are the page positions where
 * a new recipe begins. The mixed-up text is cleared so each recipe can be read again (or typed).
 */
export async function splitRecipe(id: string, starts: number[]): Promise<Result<{ ids: string[] }>> {
  const { viewer, db, recipe } = await ownRecipe(id);
  if (!recipe) return { ok: false, error: "Recipe not found." };
  const pages = await db
    .select({ id: schema.recipePhotos.id })
    .from(schema.recipePhotos)
    .where(eq(schema.recipePhotos.recipeId, id))
    .orderBy(asc(schema.recipePhotos.position));
  const cuts = [...new Set(starts.filter((n) => Number.isInteger(n) && n > 0 && n < pages.length))].sort((a, b) => a - b);
  if (!cuts.length) return { ok: false, error: "Mark where a new recipe starts." };
  const bounds = [0, ...cuts, pages.length];
  const ids = [id];
  for (let g = 1; g < bounds.length - 1; g++) {
    const [created] = await db
      .insert(schema.recipes)
      .values({ householdId: viewer.household.id, title: "Untitled recipe", sourceType: "photo", createdBy: viewer.user.name })
      .returning({ id: schema.recipes.id });
    ids.push(created.id);
    const moved = pages.slice(bounds[g], bounds[g + 1]);
    for (const [position, p] of moved.entries()) {
      await db.update(schema.recipePhotos).set({ recipeId: created.id, position }).where(eq(schema.recipePhotos.id, p.id));
    }
  }
  // The first recipe keeps its first pages; its text mixed several recipes, so it's cleared too.
  await db
    .update(schema.recipes)
    .set({ ingredients: [], steps: [], readWith: null, title: recipe.titleByHand ? recipe.title : "Untitled recipe", imageUrl: null, servings: null, prepMinutes: null, cookMinutes: null, totalMinutes: null })
    .where(eq(schema.recipes.id, id));
  revalidatePath("/recipes");
  return { ok: true, value: { ids } };
}

export async function setRating(id: string, rating: number | null) {
  const { db, recipe } = await ownRecipe(id);
  if (!recipe) return;
  const value = rating === null ? null : Math.max(1, Math.min(5, Math.round(rating)));
  await db.update(schema.recipes).set({ rating: value }).where(eq(schema.recipes.id, id));
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
}

export async function setFavorite(id: string, value: boolean) {
  const { db, recipe } = await ownRecipe(id);
  if (!recipe) return;
  await db.update(schema.recipes).set({ isFavorite: value }).where(eq(schema.recipes.id, id));
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
}

export async function setStaple(id: string, everyWeeks: number | null) {
  const { db, recipe } = await ownRecipe(id);
  if (!recipe) return;
  const weeks = everyWeeks === null ? null : Math.max(1, Math.min(12, Math.round(everyWeeks)));
  await db.update(schema.recipes).set({ isStaple: weeks !== null, stapleEveryWeeks: weeks }).where(eq(schema.recipes.id, id));
  revalidatePath("/recipes");
  revalidatePath(`/recipes/${id}`);
}

export async function deleteRecipe(id: string): Promise<Result<null>> {
  const { db, recipe } = await ownRecipe(id);
  if (!recipe) return { ok: false, error: "Recipe not found." };
  await db.delete(schema.recipes).where(eq(schema.recipes.id, id));
  revalidatePath("/recipes");
  return { ok: true, value: null };
}

/** "Add to this week" from a recipe page. */
export async function addToWeek(recipeId: string, mealType: "breakfast" | "lunch" | "dinner"): Promise<Result<{ weekStart: string }>> {
  const { viewer, db, recipe } = await ownRecipe(recipeId);
  if (!recipe) return { ok: false, error: "Recipe not found." };
  const weekStart = currentWeekStart(viewer.household.settings);
  let [plan] = await db
    .select()
    .from(schema.mealPlans)
    .where(and(eq(schema.mealPlans.householdId, viewer.household.id), eq(schema.mealPlans.weekStart, weekStart)))
    .limit(1);
  if (!plan) [plan] = await db.insert(schema.mealPlans).values({ householdId: viewer.household.id, weekStart }).returning();
  else if (plan.status === "approved") await db.update(schema.mealPlans).set({ status: "draft" }).where(eq(schema.mealPlans.id, plan.id));
  const existing = await db.select().from(schema.planMeals).where(eq(schema.planMeals.planId, plan.id));
  await db.insert(schema.planMeals).values({
    planId: plan.id,
    mealType,
    position: existing.reduce((m, x) => Math.max(m, x.position), 0) + 1,
    recipeId,
    servings: plan.request?.people ?? viewer.household.settings.people,
  });
  revalidatePath("/week");
  return { ok: true, value: { weekStart } };
}
