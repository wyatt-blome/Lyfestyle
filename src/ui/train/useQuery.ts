"use client";
import { useSearchParams } from "next/navigation";
import type { Variant } from "@/lib/session";
import type { SessionId } from "@/lib/types";
import { sessionById } from "@/client/sessionPlan";

/** ?id=A&v=short&d=1 → typed values. */
export function useSessionQuery(): { id: SessionId | undefined; variant: Variant; deload: boolean | undefined } {
  const q = useSearchParams();
  const raw = q.get("id") ?? undefined;
  const id = raw && sessionById.has(raw as SessionId) ? (raw as SessionId) : undefined;
  const v = q.get("v");
  const variant: Variant = v === "short" || v === "easy" ? v : "full";
  const d = q.get("d");
  return { id, variant, deload: d === null ? undefined : d === "1" };
}

export function startHref(id: SessionId, variant: Variant, deload: boolean): string {
  const t = sessionById.get(id)!;
  const qs = `id=${id}&v=${variant}&d=${deload ? 1 : 0}`;
  switch (t.type) {
    case "strength":
      return `/train/log?${qs}`;
    case "quick20":
      return `/train/quick?${qs}`;
    case "interval":
      return `/train/4x4?${qs}`;
    default:
      return `/train/follow?${qs}`;
  }
}
