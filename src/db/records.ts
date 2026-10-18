// Create/update/soft-delete helpers that keep id, createdAt, updatedAt and deletedAt right.
import type { EntityTable } from "dexie";
import type { Base } from "@/lib/types";

// Dexie's insert/update generics don't narrow through a generic T, hence the `as never` casts.
type RecordTable<T extends Base> = EntityTable<T, "id">;

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function create<T extends Base>(table: RecordTable<T>, data: Omit<T, keyof Base>): Promise<T> {
  const t = nowIso();
  const row = { ...data, id: uuid(), createdAt: t, updatedAt: t } as T;
  await table.add(row as never);
  return row;
}

export async function update<T extends Base>(table: RecordTable<T>, id: string, changes: Partial<T>): Promise<void> {
  await table.update(id as never, { ...changes, updatedAt: nowIso() } as never);
}

export async function softDelete<T extends Base>(table: RecordTable<T>, id: string): Promise<void> {
  const t = nowIso();
  await table.update(id as never, { deletedAt: t, updatedAt: t } as never);
}

export function alive<T extends Base>(rows: T[]): T[] {
  return rows.filter((r) => !r.deletedAt);
}
