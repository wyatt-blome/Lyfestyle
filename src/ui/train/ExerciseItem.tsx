"use client";
import Link from "next/link";
import { useState } from "react";
import { setSwap } from "@/client/workouts";
import { describeItem } from "@/lib/session";
import type { SessionId, SessionItem } from "@/lib/types";
import { exerciseById } from "@/seed";
import { Badge, Button, Sheet } from "../kit";
import { LoopedDemo } from "../LoopedDemo";
import { WhyCards } from "../WhyCard";

/** One move in a session list: name, dose, demo, cues, and the Swap sheet. */
export function ExerciseItem({
  item,
  rounds,
  restSec,
  templateId,
  original,
  sessionSwap,
  stageLabel,
  swapped = false,
}: {
  item: SessionItem;
  rounds?: number;
  restSec?: number;
  templateId: SessionId;
  /** The template's exercise when a swap is in effect. */
  original: string;
  sessionSwap?: string;
  stageLabel?: string;
  swapped?: boolean;
}) {
  const ex = exerciseById.get(item.exerciseId);
  const [open, setOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  if (!ex) return null;
  const orig = exerciseById.get(original);
  const options = [...new Set([original, ...(sessionSwap ? [sessionSwap] : []), ...(orig?.swapIds ?? [])])]
    .map((id) => exerciseById.get(id))
    .filter((e): e is NonNullable<typeof e> => !!e);

  return (
    <li className="py-3">
      <button type="button" className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>
          <span className="block text-lg font-medium">{ex.name}</span>
          <span className="block text-base text-muted tabular">{describeItem(item, rounds, restSec)}</span>
          {item.note && <span className="block text-sm text-muted">{item.note}</span>}
          {stageLabel && <span className="mt-1 inline-block"><Badge tone="info">Stage: {stageLabel}</Badge></span>}
          {swapped && <span className="mt-1 ml-1 inline-block"><Badge>Swapped</Badge></span>}
        </span>
        <span className="text-2xl text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <LoopedDemo exercise={ex} cues={false} />
          <ul className="list-disc pl-5 text-base">
            {ex.cues.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <p className="text-sm text-muted">Avoid: {ex.faults.join(" · ")}</p>
          <WhyCards keys={[`exercise:${ex.id}`]} />
          <div className="grid grid-cols-2 gap-2">
            {options.length > 1 && <Button onClick={() => setSwapOpen(true)}>Swap</Button>}
            <Link href={`/train/exercises/${ex.id}`} className="btn flex min-h-12 items-center justify-center rounded-2xl border border-line bg-surface-2 text-lg">
              Details
            </Link>
          </div>
        </div>
      )}
      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} title={`Swap ${orig?.name ?? ex.name}`}>
        <p className="mb-3 text-base text-muted">The swap is remembered for this session.</p>
        <ul className="flex flex-col gap-2">
          {options.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={`flex min-h-14 w-full items-center justify-between rounded-2xl px-4 text-left text-lg ${o.id === item.exerciseId ? "bg-accent text-accent-ink" : "bg-surface-2"}`}
                onClick={async () => {
                  await setSwap(templateId, original, o.id === original ? null : o.id);
                  setSwapOpen(false);
                }}
              >
                {o.name}
                {o.id === original && <span className="text-sm">original</span>}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </li>
  );
}
