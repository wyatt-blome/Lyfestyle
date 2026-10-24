import { asc, inArray } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/db";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { recipeImageSrc } from "@/lib/images";
import { looksLikeBadTitle, suggestTitle } from "@/lib/import/title";
import { requireViewer } from "@/server/auth";
import { householdRecipes } from "@/server/data";
import { ReadAllWithClaude } from "@/components/ReadWithClaude";
import { aiAvailable } from "@/lib/import/ai";
import { NameRecipes } from "./NameRecipes";

export default async function NameRecipesPage() {
  const viewer = await requireViewer();
  const all = await householdRecipes(viewer.household.id);
  // Names that look broken first, then everything else that was read from a photo or pasted text.
  const flagged = all.filter((r) => !r.titleByHand && looksLikeBadTitle(r.title));
  const others = all.filter((r) => !flagged.includes(r) && (r.sourceType === "photo" || r.sourceType === "text"));
  const list = [...flagged, ...others];

  const db = await getDb();
  const pages = list.length
    ? await db
        .select({ id: schema.recipePhotos.id, recipeId: schema.recipePhotos.recipeId })
        .from(schema.recipePhotos)
        .where(inArray(schema.recipePhotos.recipeId, list.map((r) => r.id)))
        .orderBy(asc(schema.recipePhotos.position))
    : [];
  const withPages = await db.selectDistinct({ recipeId: schema.recipePhotos.recipeId }).from(schema.recipePhotos);
  const photoIds = new Set(withPages.map((p) => p.recipeId));
  const firstPage = new Map<string, string>();
  for (const p of pages) if (!firstPage.has(p.recipeId)) firstPage.set(p.recipeId, `/api/recipe-photo/${p.id}`);

  return (
    <>
      <Link href="/recipes" className="flex items-center gap-1 pt-2 text-sm text-muted">
        <Icon name="chevronLeft" className="size-4" /> Recipes
      </Link>
      <PageHeader title="Rename recipes" subtitle="Check each photo and type the name of the dish. Only names you change are saved." />
      {aiAvailable() ? <ReadAllWithClaude ids={all.filter((r) => r.readWith !== "claude" && (photoIds.has(r.id) || r.imageUrl?.startsWith("data:"))).map((r) => r.id)} /> : null}
      {list.length ? (
        <NameRecipes
          recipes={list.map((r) => ({
            id: r.id,
            current: r.title,
            flagged: flagged.includes(r),
            suggestion: suggestTitle(r),
            imageUrl: firstPage.get(r.id) ?? recipeImageSrc(r),
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
