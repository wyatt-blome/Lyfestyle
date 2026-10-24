import { and, asc, eq } from "drizzle-orm";
import { recipeImageSrc } from "@/lib/images";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { requireViewer } from "@/server/auth";
import { CookMode } from "./CookMode";

export default async function CookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ servings?: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const { servings } = await searchParams;
  const db = await getDb();
  const [r] = await db
    .select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, viewer.household.id)))
    .limit(1);
  if (!r) notFound();
  const wanted = Number(servings);
  const pages = await db
    .select({ id: schema.recipePhotos.id })
    .from(schema.recipePhotos)
    .where(eq(schema.recipePhotos.recipeId, r.id))
    .orderBy(asc(schema.recipePhotos.position));
  const thumb = recipeImageSrc(r);
  const photos = pages.length ? pages.map((p) => `/api/recipe-photo/${p.id}`) : thumb && r.sourceType === "photo" ? [thumb] : [];
  return (
    <CookMode
      id={r.id}
      title={r.title}
      baseServings={r.servings}
      servings={Number.isInteger(wanted) && wanted > 0 && wanted <= 60 ? wanted : (r.servings ?? viewer.household.settings.people)}
      ingredients={r.ingredients}
      steps={r.steps}
      notes={r.notes}
      photos={photos}
    />
  );
}
