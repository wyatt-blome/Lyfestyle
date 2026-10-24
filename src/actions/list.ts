"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { packagesFor } from "@/lib/ingredients/catalog";
import { sentenceCase } from "@/lib/ingredients/names";
import { identify } from "@/lib/ingredients/normalize";
import { parseProductUrl, searchQuery } from "@/lib/stores";
import { searchWalmart, WalmartError, walmartLookupAvailable } from "@/lib/walmart";
import { requireViewer } from "@/server/auth";
import { planById } from "@/server/data";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function ownItem(itemId: string) {
  const viewer = await requireViewer();
  const db = await getDb();
  const [row] = await db
    .select({ item: schema.groceryItems })
    .from(schema.groceryItems)
    .innerJoin(schema.mealPlans, eq(schema.mealPlans.id, schema.groceryItems.planId))
    .where(and(eq(schema.groceryItems.id, itemId), eq(schema.mealPlans.householdId, viewer.household.id)))
    .limit(1);
  return { viewer, db, item: row?.item ?? null };
}

export async function setItemStatus(itemId: string, status: "have" | "need"): Promise<Result<null>> {
  const { viewer, db, item } = await ownItem(itemId);
  if (!item) return { ok: false, error: "Item not found." };
  await db
    .update(schema.groceryItems)
    .set({ status, inCart: status === "have" ? false : item.inCart, updatedBy: viewer.user.name, updatedAt: new Date() })
    .where(eq(schema.groceryItems.id, itemId));
  revalidatePath("/list");
  return { ok: true, value: null };
}

export async function setInCart(itemId: string, inCart: boolean): Promise<Result<null>> {
  const { viewer, db, item } = await ownItem(itemId);
  if (!item) return { ok: false, error: "Item not found." };
  await db.update(schema.groceryItems).set({ inCart, updatedBy: viewer.user.name, updatedAt: new Date() }).where(eq(schema.groceryItems.id, itemId));
  revalidatePath("/list");
  return { ok: true, value: null };
}

/** "Select all": mark many items at once. Only items on this household's plan are touched. */
export async function updateItems(planId: string, itemIds: string[], patch: { status?: "have" | "need"; inCart?: boolean }): Promise<Result<null>> {
  const viewer = await requireViewer();
  const plan = await planById(viewer.household.id, planId);
  if (!plan) return { ok: false, error: "Plan not found." };
  const ids = z.array(z.string().max(64)).max(1000).safeParse(itemIds);
  if (!ids.success || !ids.data.length) return { ok: true, value: null };
  const set: Partial<typeof schema.groceryItems.$inferInsert> = { updatedBy: viewer.user.name, updatedAt: new Date() };
  if (patch.status) set.status = patch.status;
  if (patch.inCart !== undefined) set.inCart = patch.inCart;
  if (patch.status === "have") set.inCart = false;
  const db = await getDb();
  await db
    .update(schema.groceryItems)
    .set(set)
    .where(and(eq(schema.groceryItems.planId, plan.id), inArray(schema.groceryItems.id, ids.data)));
  revalidatePath("/list");
  return { ok: true, value: null };
}

export async function removeItem(itemId: string): Promise<Result<null>> {
  const { db, item } = await ownItem(itemId);
  if (!item) return { ok: true, value: null };
  await db.delete(schema.groceryItems).where(eq(schema.groceryItems.id, itemId));
  revalidatePath("/list");
  return { ok: true, value: null };
}

export async function addItem(planId: string, text: string): Promise<Result<null>> {
  const viewer = await requireViewer();
  const plan = await planById(viewer.household.id, planId);
  if (!plan) return { ok: false, error: "Plan not found." };
  const name = z.string().trim().min(1).max(120).safeParse(text);
  if (!name.success) return { ok: false, error: "Type what you need." };
  const id = identify(name.data);
  const db = await getDb();
  await db.insert(schema.groceryItems).values({
    planId,
    key: id.item ? id.key : `manual:${name.data.toLowerCase()}`,
    // The standard name when we know the item ("milk" → "Milk", "eggs" → "Eggs").
    name: id.item ? id.item.name : sentenceCase(name.data),
    aisle: id.aisle,
    needText: "",
    buyWalmart: id.item ? packagesFor(id.item, "walmart")[0].label : null,
    buySams: id.item ? packagesFor(id.item, "sams")[0].label : null,
    manual: true,
    status: "need",
    updatedBy: viewer.user.name,
  });
  revalidatePath("/list");
  return { ok: true, value: null };
}

/** "We always have this": future lists start it as "have". */
export async function setAlwaysHave(itemId: string, onHand: boolean): Promise<Result<null>> {
  const { viewer, db, item } = await ownItem(itemId);
  if (!item) return { ok: false, error: "Item not found." };
  await db
    .insert(schema.pantryItems)
    .values({ householdId: viewer.household.id, key: item.key, name: item.name, onHand })
    .onConflictDoUpdate({ target: [schema.pantryItems.householdId, schema.pantryItems.key], set: { onHand, name: item.name } });
  await db
    .update(schema.groceryItems)
    .set({ pantry: onHand, status: onHand ? "have" : item.status, updatedBy: viewer.user.name, updatedAt: new Date() })
    .where(eq(schema.groceryItems.id, itemId));
  revalidatePath("/list");
  revalidatePath("/household");
  return { ok: true, value: null };
}

export async function rememberProduct(store: "walmart" | "sams", key: string, productUrl: string): Promise<Result<null>> {
  const viewer = await requireViewer();
  const parsed = parseProductUrl(store, productUrl);
  if (!parsed) return { ok: false, error: store === "walmart" ? "Paste a walmart.com product link." : "Paste a samsclub.com product link." };
  const db = await getDb();
  await db
    .insert(schema.storeProducts)
    .values({ householdId: viewer.household.id, store, key: key.slice(0, 200), productUrl: parsed.url, itemId: parsed.itemId })
    .onConflictDoUpdate({
      target: [schema.storeProducts.householdId, schema.storeProducts.store, schema.storeProducts.key],
      set: { productUrl: parsed.url, itemId: parsed.itemId },
    });
  revalidatePath("/list");
  return { ok: true, value: null };
}

export async function forgetProduct(store: "walmart" | "sams", key: string): Promise<Result<null>> {
  const viewer = await requireViewer();
  const db = await getDb();
  await db
    .delete(schema.storeProducts)
    .where(and(eq(schema.storeProducts.householdId, viewer.household.id), eq(schema.storeProducts.store, store), eq(schema.storeProducts.key, key)));
  revalidatePath("/list");
  return { ok: true, value: null };
}

/**
 * Find the Walmart product for every item still to buy that doesn't have one saved yet, so the
 * whole order can go into the Walmart cart with one tap. Needs walmart.io keys.
 */
export async function matchWalmartProducts(planId: string): Promise<Result<{ matched: number; missed: string[] }>> {
  const viewer = await requireViewer();
  if (!walmartLookupAvailable()) return { ok: false, error: "Walmart product lookup isn't set up." };
  const plan = await planById(viewer.household.id, planId);
  if (!plan) return { ok: false, error: "Plan not found." };
  const db = await getDb();
  const [items, saved] = await Promise.all([
    db.select().from(schema.groceryItems).where(and(eq(schema.groceryItems.planId, plan.id), eq(schema.groceryItems.status, "need"))),
    db
      .select({ key: schema.storeProducts.key })
      .from(schema.storeProducts)
      .where(and(eq(schema.storeProducts.householdId, viewer.household.id), eq(schema.storeProducts.store, "walmart"))),
  ]);
  const have = new Set(saved.map((p) => p.key));
  const todo = items.filter((i) => !have.has(i.key)).slice(0, 80);
  let matched = 0;
  const missed: string[] = [];
  let next = 0;
  try {
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (next < todo.length) {
          const item = todo[next++];
          const found = await searchWalmart(searchQuery(item.name, item.buyWalmart, "walmart"));
          if (!found) {
            missed.push(item.name);
            continue;
          }
          await db
            .insert(schema.storeProducts)
            .values({
              householdId: viewer.household.id,
              store: "walmart",
              key: item.key,
              productUrl: `https://www.walmart.com/ip/${found.itemId}`,
              itemId: found.itemId,
              label: found.name.slice(0, 200),
            })
            .onConflictDoNothing();
          matched++;
        }
      }),
    );
  } catch (e) {
    if (e instanceof WalmartError) return { ok: false, error: e.message };
    throw e;
  }
  revalidatePath("/list");
  return { ok: true, value: { matched, missed } };
}
