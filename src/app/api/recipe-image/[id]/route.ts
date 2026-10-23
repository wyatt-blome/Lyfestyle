import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getViewer } from "@/server/auth";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  const { id } = await ctx.params;
  const db = await getDb();
  const [row] = await db
    .select({ imageUrl: schema.recipes.imageUrl })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, viewer.household.id)))
    .limit(1);
  const m = row?.imageUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": "private, max-age=86400" },
  });
}
