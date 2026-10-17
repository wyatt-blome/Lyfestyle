"use client";
import Link from "next/link";
import { useSettings } from "@/client/settings";
import { useNow } from "@/client/useNow";
import { useProgression, useWorkoutLogs } from "@/client/workouts";
import { LADDERS, LIGHT_TO_HEAVY_RULE, stageOf } from "@/lib/progression";
import { mondayOf, planForDay, weekInfo } from "@/lib/rotation";
import { addDays, dateKey } from "@/lib/time";
import { defaultRotation, exerciseById } from "@/seed";
import { sessionById } from "@/client/sessionPlan";
import { Badge, Card, Page } from "../kit";
import { WhyCards } from "../WhyCard";

const LADDER_NAMES: Record<string, string> = {
  "kb-swing-2h": "Swing",
  "kb-tgu": "Turkish get-up",
  "kb-press": "Press",
  "kb-goblet-squat": "Goblet squat",
  "kb-suitcase-carry": "Suitcase carry",
  "mcgill-big3": "McGill Big 3",
  "4x4": "Norwegian 4×4",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ProgramScreen() {
  const now = useNow(60_000);
  const settings = useSettings();
  const logs = useWorkoutLogs();
  const prog = useProgression();
  if (!settings || !logs || !prog) return <Page title="Program" back="/train">{null}</Page>;
  const rotation = { ...defaultRotation, startDate: settings.rotationStartDate };
  const today = dateKey(now, settings.tz);
  const wk = weekInfo(rotation, today);
  const monday = mondayOf(today);
  const done = new Set(logs.map((l) => `${l.date}|${l.templateId}`));
  const doneOn = (d: string) => logs.filter((l) => l.date === d);
  const others = [...prog.values()].filter((p) => !LADDERS[p.exerciseId]);

  return (
    <Page title="Program" back="/train">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Week" value={String(wk.week)} />
        <Stat label="Cycle week" value={`${wk.cycleWeek}/6`} />
        <Stat label="Deload" value={wk.deload ? "Yes" : `in ${6 - wk.cycleWeek} wk`} />
      </div>
      {wk.deload && <WhyCards ids={["why-deload-sleep"]} />}

      <Card title="This week">
        <ul className="flex flex-col divide-y divide-line">
          {DAYS.map((label, i) => {
            const d = addDays(monday, i);
            const p = planForDay(rotation, d, (date, id) => done.has(`${date}|${id}`));
            const s = p.sessionId === "REST" ? null : sessionById.get(p.sessionId);
            const did = doneOn(d);
            return (
              <li key={d} className={`flex items-center justify-between gap-2 py-3 ${d === today ? "text-accent" : ""}`}>
                <span>
                  <span className="mr-2 inline-block w-10 font-semibold">{label}</span>
                  {s ? (
                    <Link href={`/train/session?id=${s.id}`} className="underline-offset-4 hover:underline">
                      {s.id.startsWith("Q") ? s.name : `${s.id} · ${s.name}`}
                    </Link>
                  ) : (
                    "Rest (optional Daily 10)"
                  )}
                </span>
                {did.length > 0 ? <Badge tone="good">✓ {did.map((x) => x.templateId).join(", ")}</Badge> : d < today ? <Badge>skipped</Badge> : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-sm text-muted">A missed day is skipped, never doubled. A missed Wednesday 4×4 moves to Saturday.</p>
      </Card>

      <Card title="Stages">
        <ul className="flex flex-col divide-y divide-line">
          {Object.keys(LADDERS).map((key) => {
            const st = prog.get(key);
            const stage = stageOf(key, st)!;
            return (
              <li key={key} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-lg">{LADDER_NAMES[key]}</span>
                  <Badge tone="info">
                    Stage {st?.stage ?? 1}/{LADDERS[key].length}
                  </Badge>
                </div>
                <p className="text-base text-muted">
                  {stage.label}
                  {st?.consecutiveHits ? ` · ${st.consecutiveHits}/2 qualifying sessions` : ""}
                </p>
              </li>
            );
          })}
          {others.map((p) => (
            <li key={p.exerciseId} className="flex items-center justify-between py-3">
              <span className="text-lg">{exerciseById.get(p.exerciseId)?.name ?? p.exerciseId}</span>
              <span className="text-base text-muted tabular">
                {p.currentLoadLb} lb · from {p.repTarget} reps
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-sm text-muted">
          Two qualifying sessions in a row (every set done, RPE ≤ 7) move you up. {LIGHT_TO_HEAVY_RULE}
        </p>
      </Card>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-surface p-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-2xl font-bold tabular">{value}</div>
    </div>
  );
}
