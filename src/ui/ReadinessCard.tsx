"use client";
// Daily readiness check-in: sleep, soreness and energy, 1–5, higher is always better. A low score
// suggests an Easy Day. Drop it on any screen; it reads and writes today's row by itself.
import { useState } from "react";
import { saveReadiness, useTodayReadiness } from "@/client/readiness";
import { useSettings } from "@/client/settings";
import { readinessScore, suggestsEasyDay } from "@/lib/progress";
import { dateKey } from "@/lib/time";
import { Button, Card, Notice, Scale } from "./kit";
import { useToast } from "./Toast";
import { WhyCards } from "./WhyCard";

type Draft = { sleep?: number; soreness?: number; energy?: number };

export function ReadinessCard({ className = "" }: { className?: string }) {
  const today = useTodayReadiness();
  const settings = useSettings();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);

  if (today === undefined) return null;

  const showForm = !today || editing;
  const complete = draft.sleep && draft.soreness && draft.energy;

  if (showForm) {
    return (
      <Card title="Readiness check-in" className={className}>
        <div className="flex flex-col gap-4">
          <Scale label="Sleep last night" value={draft.sleep} onChange={(n) => setDraft({ ...draft, sleep: n })} low="Poor" high="Great" />
          <Scale label="Soreness" value={draft.soreness} onChange={(n) => setDraft({ ...draft, soreness: n })} low="Very sore" high="Fresh" />
          <Scale label="Energy" value={draft.energy} onChange={(n) => setDraft({ ...draft, energy: n })} low="Drained" high="Full" />
          <div className={`grid gap-3 ${editing ? "grid-cols-2" : "grid-cols-1"}`}>
            <Button
              variant="primary"
              disabled={!complete || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await saveReadiness(dateKey(Date.now(), settings?.tz), draft as Required<Draft>);
                  setEditing(false);
                  setDraft({});
                } catch (e) {
                  toast((e as Error).message, "bad");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Save check-in
            </Button>
            {editing && (
              <Button
                onClick={() => {
                  setEditing(false);
                  setDraft({});
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  const score = readinessScore(today);
  const easy = suggestsEasyDay(today);
  return (
    <Card
      title="Readiness"
      className={className}
      action={
        <Button
          variant="ghost"
          onClick={() => {
            setDraft({ sleep: today.sleep, soreness: today.soreness, energy: today.energy });
            setEditing(true);
          }}
        >
          Edit
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold tabular">{score.toFixed(1)}</span>
          <span className="text-base text-muted">of 5 today</span>
        </div>
        <p className="text-base text-muted tabular">
          Sleep {today.sleep} · Soreness {today.soreness} (5 = fresh) · Energy {today.energy}
        </p>
        {easy && (
          <>
            <Notice>Low readiness: take an Easy Day (M, Z or Daily 10).</Notice>
            <WhyCards ids={["why-deload-sleep"]} />
          </>
        )}
      </div>
    </Card>
  );
}
