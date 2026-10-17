"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { create, softDelete, update } from "@/db/records";
import type { FavoriteItem, IntakeTemplate } from "@/lib/types";

/** Live favorites in their saved order. */
export function useFavorites(): FavoriteItem[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db().favorites.orderBy("sort").toArray();
    return rows.filter((r) => !r.deletedAt);
  }, []);
}

export async function addFavorite(label: string, template: IntakeTemplate): Promise<FavoriteItem> {
  const rows = (await db().favorites.toArray()).filter((r) => !r.deletedAt);
  const sort = rows.reduce((m, r) => Math.max(m, r.sort), -1) + 1;
  return create(db().favorites, { label: label.trim() || template.name, template, sort });
}

export async function deleteFavorite(id: string): Promise<void> {
  await softDelete(db().favorites, id);
}

/** Move a favorite one step up (-1) or down (+1) by swapping sort values with its neighbor. */
export async function moveFavorite(id: string, dir: -1 | 1): Promise<void> {
  await db().transaction("rw", db().favorites, async () => {
    const rows = (await db().favorites.orderBy("sort").toArray()).filter((r) => !r.deletedAt);
    const i = rows.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= rows.length) return;
    // Renumber so equal sort values can't get stuck.
    const order = rows.map((r) => r.id);
    [order[i], order[j]] = [order[j], order[i]];
    for (let k = 0; k < order.length; k++) {
      const row = rows.find((r) => r.id === order[k])!;
      if (row.sort !== k) await update(db().favorites, row.id, { sort: k });
    }
  });
}
