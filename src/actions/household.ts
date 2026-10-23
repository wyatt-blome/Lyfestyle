"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireViewer, newInviteCode } from "@/server/auth";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const Settings = z.object({
  name: z.string().trim().min(1).max(60),
  people: z.number().int().min(1).max(30),
  store: z.enum(["walmart", "sams"]),
  weekStartsOn: z.number().int().min(0).max(6),
  timeZone: z.string().min(1).max(60),
  breakfasts: z.number().int().min(0).max(14),
  lunches: z.number().int().min(0).max(14),
  dinners: z.number().int().min(0).max(14),
});

export async function saveSettings(input: z.input<typeof Settings>): Promise<Result<null>> {
  const viewer = await requireViewer();
  const parsed = Settings.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the settings." };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timeZone });
  } catch {
    return { ok: false, error: "Unknown time zone." };
  }
  const { name, ...settings } = parsed.data;
  const db = await getDb();
  await db
    .update(schema.households)
    .set({ name, settings: { ...viewer.household.settings, ...settings } })
    .where(eq(schema.households.id, viewer.household.id));
  revalidatePath("/", "layout");
  return { ok: true, value: null };
}

export async function setStore(store: "walmart" | "sams"): Promise<Result<null>> {
  const viewer = await requireViewer();
  if (store !== "walmart" && store !== "sams") return { ok: false, error: "Unknown store." };
  const db = await getDb();
  await db
    .update(schema.households)
    .set({ settings: { ...viewer.household.settings, store } })
    .where(eq(schema.households.id, viewer.household.id));
  revalidatePath("/", "layout");
  return { ok: true, value: null };
}

export async function newCode(): Promise<Result<string>> {
  const viewer = await requireViewer();
  const db = await getDb();
  const code = newInviteCode();
  await db.update(schema.households).set({ inviteCode: code }).where(eq(schema.households.id, viewer.household.id));
  revalidatePath("/household");
  return { ok: true, value: code };
}

export async function setPantryItem(key: string, name: string, onHand: boolean | null): Promise<Result<null>> {
  const viewer = await requireViewer();
  const db = await getDb();
  if (onHand === null) {
    await db.delete(schema.pantryItems).where(and(eq(schema.pantryItems.householdId, viewer.household.id), eq(schema.pantryItems.key, key)));
  } else {
    await db
      .insert(schema.pantryItems)
      .values({ householdId: viewer.household.id, key: key.slice(0, 200), name: name.slice(0, 120), onHand })
      .onConflictDoUpdate({ target: [schema.pantryItems.householdId, schema.pantryItems.key], set: { onHand } });
  }
  revalidatePath("/household");
  return { ok: true, value: null };
}
