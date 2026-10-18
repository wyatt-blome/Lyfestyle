"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { create, softDelete, update } from "@/db/records";
import { canStart, endStatus, overlapError, validateTimes } from "@/lib/fasting";
import type { Fast, ProtocolId } from "@/lib/types";

export function useActiveFast(): Fast | null | undefined {
  return useLiveQuery(async () => {
    const rows = await db().fasts.where("status").equals("active").toArray();
    return rows.filter((f) => !f.deletedAt).sort((a, b) => b.startAt.localeCompare(a.startAt))[0] ?? null;
  }, []);
}

export function useFasts(): Fast[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db().fasts.orderBy("startAt").reverse().toArray();
    return rows.filter((f) => !f.deletedAt);
  }, []);
}

export async function activeFast(): Promise<Fast | undefined> {
  const rows = await db().fasts.where("status").equals("active").toArray();
  return rows.filter((f) => !f.deletedAt).sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
}

export async function startFast(input: {
  protocol: ProtocolId;
  targetHours: number;
  startAt: string;
  doctorAck: boolean;
}): Promise<Fast> {
  const gate = canStart(input.targetHours, input.doctorAck);
  if (!gate.ok) throw new Error(gate.reason);
  const err = validateTimes(input.startAt, undefined, Date.now());
  if (err) throw new Error(err);
  const existing = await activeFast();
  if (existing) throw new Error("A fast is already running.");
  const overlap = overlapError(input.startAt, undefined, await db().fasts.toArray());
  if (overlap) throw new Error(overlap);
  return create(db().fasts, {
    protocol: input.protocol,
    targetHours: input.targetHours,
    startAt: input.startAt,
    status: "active",
    doctorAck: input.doctorAck || undefined,
    remindersFired: [],
  });
}

export async function endFast(id: string, endAt: string): Promise<Fast> {
  const f = await db().fasts.get(id);
  if (!f) throw new Error("Fast not found.");
  const err = validateTimes(f.startAt, endAt, Date.now());
  if (err) throw new Error(err);
  const status = endStatus(f, endAt);
  // Keep the eating-window reminder fresh for this fast.
  const fired = (f.remindersFired ?? []).filter((k) => k !== "window");
  await update(db().fasts, id, { endAt, status, remindersFired: fired });
  return { ...f, endAt, status };
}

export async function editFast(
  id: string,
  changes: Pick<Partial<Fast>, "startAt" | "endAt" | "targetHours" | "protocol" | "notes" | "doctorAck">,
): Promise<void> {
  const f = await db().fasts.get(id);
  if (!f) throw new Error("Fast not found.");
  const next = { ...f, ...changes };
  const err = validateTimes(next.startAt, next.endAt, Date.now());
  if (err) throw new Error(err);
  const gate = canStart(next.targetHours, !!next.doctorAck);
  if (!gate.ok) throw new Error(gate.reason);
  if (changes.startAt !== undefined || changes.endAt !== undefined) {
    const overlap = overlapError(next.startAt, next.endAt, await db().fasts.toArray(), id);
    if (overlap) throw new Error(overlap);
  }
  const status = next.endAt ? endStatus(next, next.endAt) : "active";
  await update(db().fasts, id, { ...changes, status });
}

export async function checkInFast(
  id: string,
  data: Pick<Fast, "energy" | "hunger" | "mood" | "sleep" | "notes">,
): Promise<void> {
  await update(db().fasts, id, data);
}

export async function deleteFast(id: string): Promise<void> {
  await softDelete(db().fasts, id);
}

export async function markReminder(id: string, kind: string): Promise<void> {
  const f = await db().fasts.get(id);
  if (!f) return;
  const fired = new Set(f.remindersFired ?? []);
  fired.add(kind);
  await db().fasts.update(id, { remindersFired: [...fired] });
}
