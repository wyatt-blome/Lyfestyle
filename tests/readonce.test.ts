import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.PGLITE_DIR = "memory";
const extract = vi.fn(async () => [
  {
    title: "Grandma's Biscuits",
    continuesFromPrevious: false,
    continuesOnNext: false,
    description: null,
    servings: 8,
    prepMinutes: null,
    cookMinutes: null,
    ingredients: ["2 cups flour"],
    steps: ["Bake 12 minutes."],
    tags: [],
  },
]);
vi.mock("@/lib/import/ai", () => ({ extractPageFromImage: extract }));

describe("readPageOnce", () => {
  let householdId = "";
  beforeAll(async () => {
    const { getDb, schema } = await import("@/db");
    const db = await getDb();
    const [h] = await db.insert(schema.households).values({ name: "Test", inviteCode: "TEST-0001" }).returning();
    householdId = h.id;
  });

  it("reads a photo once and reuses the reading after that", async () => {
    const { readPageOnce } = await import("@/server/photos");
    const image = { base64: Buffer.from("same photo bytes").toString("base64"), mediaType: "image/jpeg" as const };
    const first = await readPageOnce(householdId, image);
    const again = await readPageOnce(householdId, image);
    expect(first[0].title).toBe("Grandma's Biscuits");
    expect(again).toEqual(first);
    expect(extract).toHaveBeenCalledTimes(1);
    await readPageOnce(householdId, { ...image, base64: Buffer.from("another photo").toString("base64") });
    expect(extract).toHaveBeenCalledTimes(2);
  });
});
