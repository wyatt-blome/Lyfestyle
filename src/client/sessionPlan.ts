"use client";
// Everything a session screen needs to know about today: blocks after variant, deload, swaps and
// progression stages.
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { ladderKey, prescribe } from "@/lib/progression";
import { weekInfo } from "@/lib/rotation";
import { longFastActive } from "@/lib/fasting";
import { applySwaps, deloadReasons, sessionBlocks, withoutHeavyCarries, type Variant } from "@/lib/session";
import { dateKey, HOUR_MS } from "@/lib/time";
import type { ProgressionState, SessionBlock, SessionId, SessionTemplate } from "@/lib/types";
import { defaultRotation, sessions } from "@/seed";
import { useActiveFast } from "./fasts";
import { useSettings } from "./settings";
import { useNow } from "./useNow";
import { useProgression, useSwaps } from "./workouts";

export const sessionById = new Map(sessions.map((s) => [s.id, s]));

export interface PlannedItemMeta {
  original: string;
  stageLabel?: string;
  /** The user picked a swap for this move (not just a stage change). */
  swapped: boolean;
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
  /** Heavy carries were taken out because of a fast past 24 h. */
  carriesHidden: boolean;
}

export function useDeloadReasons(now: number, manual = false): string[] | undefined {
  const settings = useSettings();
  const data = useLiveQuery(async () => {
    // Long enough to catch a multi-day fast that ended in the last 48 h.
    const since = new Date(now - 8 * 24 * HOUR_MS).toISOString();
    const fasts = (await db().fasts.where("startAt").above(since).toArray()).filter((f) => !f.deletedAt);
    const today = dateKey(now, settings?.tz);
    const r = await db().readiness.where("date").equals(today).first();
    return { fasts, readiness: r && !r.deletedAt ? (r.sleep + r.soreness + r.energy) / 3 : undefined };
  }, [Math.floor(now / 60_000), settings?.tz]);
  if (!settings || !data) return undefined;
  const wk = weekInfo({ startDate: settings.rotationStartDate, deloadEvery: defaultRotation.deloadEvery }, dateKey(now, settings.tz));
  return deloadReasons({ deloadWeek: wk.deload, readinessScore: data.readiness, recentFasts: data.fasts, now, manual });
}

export function useSessionPlan(id: SessionId | undefined, variant: Variant, deload: boolean, reasons: string[] = []): SessionPlan | undefined {
  const template = id ? sessionById.get(id) : undefined;
  const swaps = useSwaps(id ?? "A");
  const progression = useProgression();
  const fast = useActiveFast();
  const now = useNow(60_000);
  if (!template || !progression || fast === undefined) return undefined;
  const longFast = longFastActive(fast ?? undefined, now);
  const shaped = sessionBlocks(template, variant === "easy" ? "full" : variant, deload);
  const base = longFast ? withoutHeavyCarries(shaped) : shaped;
  const withSwaps = applySwaps(base, swaps);
  const meta: PlannedItemMeta[][] = [];
  const blocks = withSwaps.map((b, bi) => {
    meta[bi] = [];
    return {
      ...b,
      items: b.items.map((item, ii) => {
        const original = base[bi].items[ii].exerciseId;
        const swapped = !!swaps[original];
        // Quick 20s run their own template (D17), so their lists show it unchanged.
        if (template.type === "quick20") {
          meta[bi][ii] = { original, swapped };
          return item;
        }
        const key = ladderKey(item.exerciseId);
        const p = prescribe(item, key ? progression.get(key) : progression.get(item.exerciseId));
        meta[bi][ii] = { original, stageLabel: p.stageLabel, swapped };
        const { stageLabel: _unused, ...rest } = p;
        void _unused;
        return rest;
      }),
    };
  });
  const count = (bs: SessionBlock[]) => bs.reduce((n, b) => n + b.items.length, 0);
  return { template, variant, deload, deloadReasons: reasons, blocks, meta, swaps, progression, carriesHidden: count(shaped) !== count(base) };
}
