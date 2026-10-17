"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { create, softDelete, update } from "@/db/records";
import { entryInFast } from "@/lib/fasting";
import { activeFast } from "./fasts";
import type { Fast, IntakeEntry, IntakeTemplate } from "@/lib/types";

/** Fast-safe quick drinks (spec: water, black coffee, plain tea, electrolytes). */
export const QUICK_DRINKS: { label: string; template: IntakeTemplate }[] = [
  {
    label: "Water 16 oz",
    template: { kind: "drink", name: "Water", qty: 16, unit: "oz", breaksFast: false, tags: ["water"] },
  },
  {
    label: "Black coffee",
    template: { kind: "drink", name: "Black coffee", qty: 1, unit: "cup", caffeine: true, breaksFast: false, tags: ["coffee"] },
  },
  {
    label: "Plain tea",
    template: { kind: "drink", name: "Plain tea", qty: 1, unit: "cup", breaksFast: false, tags: ["tea"] },
  },
  {
    label: "Electrolytes",
    template: { kind: "supplement", name: "Electrolytes", qty: 1, unit: "serving", breaksFast: false, tags: ["electrolytes"] },
  },
];

/** True when an entry carries calories or is marked as breaking the fast. */
export function wouldBreakFast(t: Pick<IntakeTemplate, "breaksFast" | "kcal">): boolean {
  return t.breaksFast || (t.kcal ?? 0) > 0;
}

export async function logIntake(
  template: IntakeTemplate,
  at: string,
): Promise<{ entry: IntakeEntry; breaks: Fast | null }> {
  const fast = await activeFast();
  // A future-dated entry isn't linked to the running fast and doesn't offer to end it.
  const inFast = !!fast && entryInFast(fast.startAt, at, Date.now());
  const breaks = fast && inFast && wouldBreakFast(template) ? fast : null;
  const entry = await create(db().intake, {
    ...template,
    breaksFast: wouldBreakFast(template),
    at,
    fastId: fast && inFast ? fast.id : undefined,
    source: template.source ?? "manual",
  });
  return { entry, breaks };
}

export async function editIntake(id: string, changes: Partial<IntakeEntry>): Promise<void> {
  await update(db().intake, id, changes);
}

export async function deleteIntake(id: string): Promise<void> {
  await softDelete(db().intake, id);
}

/** Entries between two instants (ISO), newest first. */
export function useIntakeBetween(fromIso: string, toIso: string): IntakeEntry[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db().intake.where("at").between(fromIso, toIso, true, true).toArray();
    return rows.filter((r) => !r.deletedAt).sort((a, b) => b.at.localeCompare(a.at));
  }, [fromIso, toIso]);
}

export interface Totals {
  waterOz: number;
  coffee: number;
  tea: number;
  electrolytes: number;
  naMg: number;
  kMg: number;
  mgMg: number;
}

export function totals(entries: IntakeEntry[]): Totals {
  const t: Totals = { waterOz: 0, coffee: 0, tea: 0, electrolytes: 0, naMg: 0, kMg: 0, mgMg: 0 };
  for (const e of entries) {
    if (e.tags.includes("water")) t.waterOz += e.unit === "oz" ? (e.qty ?? 0) : 0;
    if (e.tags.includes("coffee")) t.coffee += e.qty ?? 1;
    if (e.tags.includes("tea")) t.tea += e.qty ?? 1;
    if (e.tags.includes("electrolytes")) t.electrolytes += e.qty ?? 1;
    t.naMg += e.electrolytes?.naMg ?? 0;
    t.kMg += e.electrolytes?.kMg ?? 0;
    t.mgMg += e.electrolytes?.mgMg ?? 0;
  }
  return t;
}
