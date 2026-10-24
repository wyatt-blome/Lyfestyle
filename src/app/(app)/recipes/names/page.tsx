import Link from "next/link";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { recipeImageSrc } from "@/lib/images";
import { looksLikeBadTitle, suggestTitle } from "@/lib/import/title";
import { requireViewer } from "@/server/auth";
import { householdRecipes } from "@/server/data";
import { NameRecipes } from "./NameRecipes";

export default async function NameRecipesPage() {
  const viewer = await requireViewer();
  const recipes = (await householdRecipes(viewer.household.id)).filter((r) => looksLikeBadTitle(r.title));
  return (
    <>
      <Link href="/recipes" className="flex items-center gap-1 pt-2 text-sm text-muted">
        <Icon name="chevronLeft" className="size-4" /> Recipes
      </Link>
      <PageHeader title="Name these recipes" subtitle="Their names came out of the photo wrong. Check the photo and type the dish name." />
      {recipes.length ? (
        <NameRecipes
          recipes={recipes.map((r) => ({
            id: r.id,
            current: r.title,
            suggestion: suggestTitle(r),
            imageUrl: recipeImageSrc(r),
            firstIngredients: r.ingredients.slice(0, 4),
          }))}
        />
      ) : (
        <EmptyState icon="check" title="Every recipe has a name">
          <Link href="/recipes" className="text-sm font-medium text-brand underline underline-offset-4">
            Back to recipes
          </Link>
        </EmptyState>
      )}
    </>
  );
}
