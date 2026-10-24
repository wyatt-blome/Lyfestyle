import { count } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { categoriesOf } from "@/lib/categories";
import { looksLikeBadTitle } from "@/lib/import/title";
import { inferMealTypes } from "@/lib/moods";
import { recipeTime } from "@/lib/time";
import { requireViewer } from "@/server/auth";
import { householdRecipes } from "@/server/data";
import { RecipeLibrary } from "./RecipeLibrary";

export default async function RecipesPage() {
  const viewer = await requireViewer();
  const recipes = await householdRecipes(viewer.household.id);
  const needNames = recipes.filter((r) => looksLikeBadTitle(r.title)).length;
  const db = await getDb();
  const photoCounts = new Map(
    (
      await db
        .select({ recipeId: schema.recipePhotos.recipeId, n: count() })
        .from(schema.recipePhotos)
        .groupBy(schema.recipePhotos.recipeId)
    ).map((r) => [r.recipeId, Number(r.n)]),
  );
  const multiPage = [...photoCounts.values()].filter((n) => n > 1).length;
  const add = (
    <Link href="/recipes/new" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-medium text-brand-ink">
      <Icon name="plus" className="size-4" /> Add
    </Link>
  );
  return (
    <>
      <PageHeader title="Recipes" subtitle={`${recipes.length} saved`} action={add} />
      {!needNames && recipes.some((r) => r.sourceType === "photo" || r.sourceType === "text") ? (
        <Link href="/recipes/names" className="-mt-2 mb-3 flex items-center gap-1.5 self-start text-sm font-medium text-brand">
          <Icon name="edit" className="size-4" /> Rename recipes from photos
        </Link>
      ) : null}
      {multiPage ? (
        <p className="mb-3 rounded-2xl border border-line bg-surface p-3 text-sm">
          <strong>{multiPage} recipe{multiPage === 1 ? " was" : "s were"} saved with several photos</strong>, and may really be several recipes. Pick{" "}
          <em>Saved with several photos</em> in the category menu, open one, and tap <em>Split pages</em>.
        </p>
      ) : null}
      {needNames ? (
        <Link href="/recipes/names" className="mb-4 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-3 text-sm">
          <Icon name="edit" className="size-5 shrink-0 text-warn" />
          <span className="flex-1">
            <strong>{needNames} recipe{needNames === 1 ? "" : "s"}</strong> came in from photos without a proper name.
          </span>
          <span className="font-medium text-brand">Rename</span>
        </Link>
      ) : null}
      {recipes.length ? (
        <RecipeLibrary
          recipes={recipes.map((r) => {
            const time = recipeTime(r);
            const mealTypes = r.mealTypes.length ? r.mealTypes : inferMealTypes(r);
            return {
              id: r.id,
              title: r.title,
              tags: r.tags,
              minutes: time?.total ?? null,
              minutesEstimated: time?.estimated ?? false,
              rating: r.rating,
              createdAt: r.createdAt.toISOString(),
              isFavorite: r.isFavorite,
              isStaple: r.isStaple,
              lastPlannedOn: r.lastPlannedOn,
              categories: categoriesOf({
                ...r,
                mealTypes,
                minutes: time?.total ?? null,
                totalMinutes: time?.total ?? null,
                needsIngredients: r.ingredients.length === 0,
                needsName: looksLikeBadTitle(r.title),
                photoCount: photoCounts.get(r.id) ?? 0,
              }),
            };
          })}
        />
      ) : (
        <EmptyState icon="book" title="Your recipe box is empty">
          <p className="max-w-sm text-sm text-muted">Import from Pinterest boards, recipe websites, photos of recipe cards, or type them in.</p>
          <Link href="/recipes/new" className="mt-2 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 font-medium text-brand-ink">
            <Icon name="plus" /> Add recipes
          </Link>
        </EmptyState>
      )}
    </>
  );
}
