"use client";
// Everything a session screen needs to know about today: blocks after variant, deload, swaps and
// progression stages.
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { ladderKey, prescribe } from "@/lib/progression";
import { weekInfo } from "@/lib/rotation";
import { applySwaps, deloadReasons, sessionBlocks, type Variant } from "@/lib/session";
import { dateKey, HOUR_MS } from "@/lib/time";
import type { ProgressionState, SessionBlock, SessionId, SessionTemplate } from "@/lib/types";
import { defaultRotation, sessions } from "@/seed";
import { useSettings } from "./settings";
import { useProgression, useSwaps } from "./workouts";

export const sessionById = new Map(sessions.map((s) => [s.id, s]));

export interface PlannedItemMeta {
  original: string;
  stageLabel?: string;
}

export interface SessionPlan {
  template: SessionTemplate;
  variant: Variant;
  deload: boolean;
  deloadReasons: string[];
  blocks: SessionBlock[];
  /** Same shape as blocks: per-item original exercise and stage. */
  meta: PlannedItemMeta[][];
  swaps: Record<string, string>;
  progression: Map<string, ProgressionState>;
}

export function useDeloadReasons(now: number, manual = false): string[] | undefined {
  const settings = useSettings();
  const data = useLiveQuery(async () => {
    const since = new Date(now - 4 * 24 * HOUR_MS).toISOString();
    const fasts = (await db().fasts.where("startAt").above(since).toArray()).filter((f) => !f.deletedAt);
    const today = dateKey(now);
    const r = await db().readiness.where("date").equals(today).first();
    return { fasts, readiness: r && !r.deletedAt ? (r.sleep + r.soreness + r.energy) / 3 : undefined };
  }, [Math.floor(now / 60_000)]);
  if (!settings || !data) return undefined;
  const wk = weekInfo({ startDate: settings.rotationStartDate, deloadEvery: defaultRotation.deloadEvery }, dateKey(now, settings.tz));
  return deloadReasons({ deloadWeek: wk.deload, readinessScore: data.readiness, recentFasts: data.fasts, now, manual });
}

export function useSessionPlan(id: SessionId | undefined, variant: Variant, deload: boolean, reasons: string[] = []): SessionPlan | undefined {
  const template = id ? sessionById.get(id) : undefined;
  const swaps = useSwaps(id ?? "A");
  const progression = useProgression();
  if (!template || !progression) return undefined;
  const base = sessionBlocks(template, variant === "easy" ? "full" : variant, deload);
  const swapped = applySwaps(base, swaps);
  const meta: PlannedItemMeta[][] = [];
  const blocks = swapped.map((b, bi) => {
    meta[bi] = [];
    return {
      ...b,
      items: b.items.map((item, ii) => {
        const original = base[bi].items[ii].exerciseId;
        const key = ladderKey(item.exerciseId);
        const p = prescribe(item, key ? progression.get(key) : progression.get(item.exerciseId));
        meta[bi][ii] = { original, stageLabel: p.stageLabel };
        const { stageLabel: _unused, ...rest } = p;
        void _unused;
        return rest;
      }),
    };
  });
  return { template, variant, deload, deloadReasons: reasons, blocks, meta, swaps, progression };
}
