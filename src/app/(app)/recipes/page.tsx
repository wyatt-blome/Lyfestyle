import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { recipeImageSrc } from "@/lib/images";
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
  const add = (
    <Link href="/recipes/new" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-medium text-brand-ink">
      <Icon name="plus" className="size-4" /> Add
    </Link>
  );
  return (
    <>
      <PageHeader title="Recipes" subtitle={`${recipes.length} saved`} action={add} />
      {needNames ? (
        <Link href="/recipes/names" className="mb-4 flex items-center gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-3 text-sm">
          <Icon name="edit" className="size-5 shrink-0 text-warn" />
          <span className="flex-1">
            <strong>{needNames} recipe{needNames === 1 ? "" : "s"}</strong> came in from photos without a proper name.
          </span>
          <span className="font-medium text-brand">Name them</span>
        </Link>
      ) : null}
      {recipes.length ? (
        <RecipeLibrary
          recipes={recipes.map((r) => ({
            id: r.id,
            title: r.title,
            imageUrl: recipeImageSrc(r),
            tags: r.tags,
            mealTypes: r.mealTypes.length ? r.mealTypes : inferMealTypes(r),
            minutes: recipeTime(r)?.total ?? null,
            minutesEstimated: recipeTime(r)?.estimated ?? false,
            rating: r.rating,
            createdAt: r.createdAt.toISOString(),
            isFavorite: r.isFavorite,
            isStaple: r.isStaple,
            needsIngredients: r.ingredients.length === 0,
            lastPlannedOn: r.lastPlannedOn,
          }))}
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
