"use client";
import Link from "next/link";
import { useState } from "react";
import { useProgression } from "@/client/workouts";
import { ladderKey, stageOf } from "@/lib/progression";
import type { Exercise } from "@/lib/types";
import { exerciseById, exercises } from "@/seed";
import { Badge, Card, Page } from "../kit";
import { LoopedDemo } from "../LoopedDemo";
import { WhyCards } from "../WhyCard";

const GROUPS: { label: string; match: (e: Exercise) => boolean }[] = [
  { label: "Kettlebell", match: (e) => e.equipment === "kettlebell" },
  { label: "Dumbbell & bench", match: (e) => e.equipment === "dumbbell" || e.equipment === "bench" || e.equipment === "mixed" },
  { label: "Bodyweight & mobility", match: (e) => e.equipment === "bodyweight" },
  { label: "Cardio", match: (e) => e.equipment === "cardio" },
];

export function ExercisesScreen() {
  const [q, setQ] = useState("");
  const list = exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Exercises" back="/train">
      <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
      {GROUPS.map((g) => {
        const items = list.filter(g.match);
        if (items.length === 0) return null;
        return (
          <Card key={g.label} title={g.label}>
            <ul className="flex flex-col divide-y divide-line">
              {items.map((e) => (
                <li key={e.id}>
                  <Link href={`/train/exercises/${e.id}`} className="btn flex min-h-14 items-center justify-between gap-2 py-2">
                    <span className="text-lg">{e.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {e.media.primary === "none" ? <Badge>cues</Badge> : e.media.approx ? <Badge tone="warn">similar</Badge> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      <p className="text-sm text-muted">
        Demos: ExerciseDB by AscendAPI (personal use) and wger.de (CC BY-SA 4.0). &ldquo;Similar movement&rdquo; marks an approximate demo.
      </p>
    </Page>
  );
}

export function ExerciseDetailScreen({ id }: { id: string }) {
  const e = exerciseById.get(id);
  const prog = useProgression();
  if (!e) return <Page title="Exercise" back="/train/exercises"><p>Not found.</p></Page>;
  const key = ladderKey(e.id);
  const st = key ? stageOf(key, prog?.get(key)) : null;
  return (
    <Page title={e.name} back="/train/exercises">
      <LoopedDemo exercise={e} size="lg" cues={false} />
      {st && <Badge tone="info">Your stage: {st.label}</Badge>}
      <Card title="Cues">
        <ul className="list-disc pl-5">
          {e.cues.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>
      <Card title="Common faults">
        <ul className="list-disc pl-5">
          {e.faults.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </Card>
      {e.defaultLoadLb && <p className="text-muted">Default load: {e.defaultLoadLb} lb</p>}
      {e.swapIds.length > 0 && (
        <Card title="Swaps">
          <ul className="flex flex-col gap-2">
            {e.swapIds.map((s) => (
              <li key={s}>
                <Link href={`/train/exercises/${s}`} className="btn inline-flex min-h-12 items-center text-info underline">
                  {exerciseById.get(s)?.name ?? s}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <WhyCards keys={[`exercise:${e.id}`]} />
    </Page>
  );
}
