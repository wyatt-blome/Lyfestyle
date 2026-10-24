import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { PageHeader } from "@/components/PageHeader";
import { RecipeEditor } from "@/components/RecipeEditor";
import { requireViewer } from "@/server/auth";

export default async function EditRecipePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const db = await getDb();
  const [r] = await db
    .select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, viewer.household.id)))
    .limit(1);
  if (!r) notFound();
  return (
    <>
      <PageHeader title="Edit recipe" />
      <RecipeEditor
        id={r.id}
        initial={{
          title: r.title,
          description: r.description,
          sourceUrl: r.sourceUrl,
          pinterestUrl: r.pinterestUrl,
          sourceType: r.sourceType,
          imageUrl: r.imageUrl,
          servings: r.servings,
          prepMinutes: r.prepMinutes,
          cookMinutes: r.cookMinutes,
          totalMinutes: r.totalMinutes,
          ingredients: r.ingredients,
          steps: r.steps,
          tags: r.tags,
          mealTypes: r.mealTypes,
          notes: r.notes,
          isFavorite: r.isFavorite,
          rating: r.rating,
          isStaple: r.isStaple,
          stapleEveryWeeks: r.stapleEveryWeeks,
        }}
      />
    </>
  );
}
