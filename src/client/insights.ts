"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { create, softDelete, update } from "@/db/records";
import type { ExpertInsight } from "@/lib/types";

export const PRINCIPLE_MAX = 280;

export interface InsightInput {
  episodeId?: string;
  principle: string;
  url: string;
  myTake?: string;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateInsight(i: InsightInput): string | null {
  const p = i.principle.trim();
  if (!p) return "Write the principle.";
  if (p.length > PRINCIPLE_MAX) return `Keep the principle to ${PRINCIPLE_MAX} characters.`;
  if (!isHttpUrl(i.url.trim())) return "Add a source link starting with http:// or https://.";
  return null;
}

function clean(i: InsightInput): InsightInput {
  return {
    episodeId: i.episodeId || undefined,
    principle: i.principle.trim(),
    url: i.url.trim(),
    myTake: i.myTake?.trim() || undefined,
  };
}

export async function addInsight(i: InsightInput): Promise<ExpertInsight> {
  const err = validateInsight(i);
  if (err) throw new Error(err);
  return create(db().insights, { ...clean(i), source: "user" });
}

export async function editInsight(id: string, i: InsightInput): Promise<void> {
  const err = validateInsight(i);
  if (err) throw new Error(err);
  // Spread undefineds so cleared fields are removed, and never let an edit change the source.
  await update(db().insights, id, { ...clean(i), source: "user" });
}

export async function deleteInsight(id: string): Promise<void> {
  await softDelete(db().insights, id);
}

/** The user's own notes only (source "user"), newest first. */
export function useUserInsights(): ExpertInsight[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db().insights.where("source").equals("user").toArray();
    return rows.filter((r) => !r.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, []);
}
