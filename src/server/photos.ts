import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { extractPageFromImage } from "@/lib/import/ai";
import type { RecipePart } from "@/lib/import/pages";

type Media = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export function photoHash(base64: string): string {
  return createHash("sha256").update(Buffer.from(base64, "base64")).digest("hex");
}

/**
 * Read one page with Claude, at most once per photo: a photo seen before (same fingerprint)
 * returns what was read the first time, without another paid request.
 */
export async function readPageOnce(householdId: string, image: { base64: string; mediaType: Media }, hash?: string): Promise<RecipePart[]> {
  const key = hash && /^[a-f0-9]{64}$/.test(hash) ? hash : photoHash(image.base64);
  const db = await getDb();
  const [hit] = await db
    .select({ parts: schema.photoReads.parts })
    .from(schema.photoReads)
    .where(and(eq(schema.photoReads.householdId, householdId), eq(schema.photoReads.hash, key)))
    .limit(1);
  if (hit) return hit.parts as RecipePart[];
  const parts = await extractPageFromImage(image);
  await db.insert(schema.photoReads).values({ householdId, hash: key, parts }).onConflictDoNothing();
  return parts;
}
