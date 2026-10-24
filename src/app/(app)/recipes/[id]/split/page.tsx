import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/PageHeader";
import { aiAvailable } from "@/lib/import/ai";
import { requireViewer } from "@/server/auth";
import { SplitPages } from "./SplitPages";

export default async function SplitPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const db = await getDb();
  const [r] = await db
    .select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, viewer.household.id)))
    .limit(1);
  if (!r) notFound();
  const pages = await db
    .select({ id: schema.recipePhotos.id })
    .from(schema.recipePhotos)
    .where(eq(schema.recipePhotos.recipeId, id))
    .orderBy(asc(schema.recipePhotos.position));
  return (
    <>
      <Link href={`/recipes/${id}`} className="flex items-center gap-1 pt-2 text-sm text-muted">
        <Icon name="chevronLeft" className="size-4" /> {r.title}
      </Link>
      <PageHeader title="Split pages" subtitle="These photos were saved as one recipe. Mark each page where a new recipe starts." />
      {pages.length > 1 ? (
        <SplitPages id={id} pages={pages.map((p) => `/api/recipe-photo/${p.id}`)} aiEnabled={aiAvailable()} />
      ) : (
        <p className="text-sm text-muted">This recipe has only one photo saved, so there&apos;s nothing to split.</p>
      )}
    </>
  );
}
