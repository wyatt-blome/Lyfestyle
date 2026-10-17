"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { unlockAudio } from "@/client/cues";
import { useActiveFast } from "@/client/fasts";
import { sessionById, useDeloadReasons, useSessionPlan } from "@/client/sessionPlan";
import { useSettings } from "@/client/settings";
import { useTodayPlan } from "@/client/today";
import { useNow } from "@/client/useNow";
import { defaultQuick, saveRun, saveWorkout, useActiveRun, useProgression, useWorkoutLogs, type ActiveRun } from "@/client/workouts";
import { allowedDuringLongFast, longFastActive } from "@/lib/fasting";
import { BIG3_IDS, quickHint, quickScoreOf, stageOf } from "@/lib/progression";
import { FOURBYFOUR_MODES, zones } from "@/lib/session";
import { build4x4, buildQuick20, createRun, followAlong, position, programSeconds, type Run } from "@/lib/timer";
import { dateKey } from "@/lib/time";
import type { SessionId, SessionTemplate, WorkoutLog } from "@/lib/types";
import { sessions } from "@/seed";
import { Badge, Button, Card, Field, LinkButton, Notice, Page } from "../kit";
import { sessionLabel } from "../TodayCard";
import { useToast } from "../Toast";
import { Runner } from "../train/Runner";
import { useSessionQuery } from "../train/useQuery";
import { WhyCards } from "../WhyCard";

const QUICKS = sessions.filter((s) => s.type === "quick20");

/** Shows the runner when a run is in progress (resumes after reload), else `children`. */
function WithActiveRun({ children }: { children: React.ReactNode }) {
  const active = useActiveRun();
  const [finished, setFinished] = useState<ActiveRun | null>(null);
  const onDone = useCallback((r: ActiveRun) => setFinished(r), []);
  if (active === undefined) return null;
  if (finished) return <Summary active={finished} onClose={() => setFinished(null)} />;
  if (active) {
    const t = sessionById.get(active.templateId)!;
    return <Runner key={active.run.startedAt} active={active} title={sessionLabel(t)} onDone={onDone} />;
  }
  return <>{children}</>;
}

async function begin(r: ActiveRun) {
  unlockAudio();
  await saveRun(r);
}

// ---------- Quick 20 ----------

export function QuickScreen() {
  return (
    <WithActiveRun>
      <QuickPicker />
    </WithActiveRun>
  );
}

function QuickPicker() {
  const { id: qId } = useSessionQuery();
  const now = useNow(30_000);
  const settings = useSettings();
  const fast = useActiveFast();
  const plan = useTodayPlan(settings, now);
  const logs = useWorkoutLogs();
  const reasons = useDeloadReasons(now) ?? [];
  const [picked, setPicked] = useState<SessionId | null>(null);
  if (!plan || !logs) return <Page title="Quick 20" back="/train">{null}</Page>;
  const deload = reasons.length > 0;
  const longFast = longFastActive(fast ?? undefined, now);
  const fallback = defaultQuick(logs, plan.week.cycleWeek, deload);
  const id = picked ?? qId ?? fallback;
  const t = sessionById.get(id)!;
  const hidden = (q: SessionTemplate) => (longFast && !allowedDuringLongFast(q.id)) || (deload && q.id === "Q5");
  const scores = (q: SessionId) => logs.filter((l) => l.templateId === q && l.quick).map(quickScoreOf).reverse();
  const last = logs.find((l) => l.templateId === id && l.quick);
  const hint = quickHint(scores(id));

  if (longFast) {
    return (
      <Page title="Quick 20" back="/train">
        <Notice tone="bad">You&apos;re in a fast over 24 h. Quick 20s are off today: do M, Z or the Daily 10.</Notice>
        <WhyCards keys={["training:during-fast"]} />
        <LinkButton href="/train/session?id=M&v=easy" variant="primary" big>
          M · Mobility &amp; Core
        </LinkButton>
        <LinkButton href="/train/session?id=DAILY10&v=easy" big>
          Daily 10
        </LinkButton>
      </Page>
    );
  }

  return (
    <Page title="Quick 20" back="/train">
      <Card>
        <p className="text-sm text-muted">{id === fallback ? "Next in the cycle" : "Picked"}</p>
        <p className="text-3xl font-bold">{t.name}</p>
        <p className="mt-1">{t.summary}</p>
        <p className="mt-1 text-base text-muted">3:00 prep → 15:00 work → 2:00 downshift · {Math.round(programSeconds(buildQuick20(t)) / 60)} min</p>
        {last && (
          <p className="mt-2 text-lg">
            Last {t.id}: <span className="font-semibold">{describeScore(t, last)}</span>
          </p>
        )}
        {hint && <Notice tone="info">{hint}</Notice>}
        {t.progressionNote && <p className="mt-2 text-base text-muted">Progress: {t.progressionNote}</p>}
        <Button
          variant="primary"
          big
          className="mt-3 w-full"
          onClick={() => void begin({ kind: "quick", templateId: t.id, variant: "full", run: createRun(buildQuick20(t), Date.now()) })}
        >
          Start {t.id}
        </Button>
      </Card>
      {deload && <Notice tone="info">Deload: Q5 is skipped. Nothing to failure.</Notice>}
      <WhyCards ids={t.whyCardIds} />
      <Card title="Or pick another">
        <div className="grid grid-cols-3 gap-2">
          {QUICKS.filter((q) => !hidden(q)).map((q) => (
            <button
              key={q.id}
              type="button"
              aria-pressed={q.id === id}
              onClick={() => setPicked(q.id)}
              className={`flex min-h-16 flex-col items-center justify-center rounded-2xl ${q.id === id ? "bg-accent text-accent-ink" : "bg-surface-2"}`}
            >
              <span className="text-xl font-bold">{q.id}</span>
              <span className="px-1 text-center text-xs">{q.name.split("· ")[1]}</span>
            </button>
          ))}
        </div>
      </Card>
    </Page>
  );
}

function describeScore(t: SessionTemplate, l: WorkoutLog): string {
  const mode = t.timer?.mode;
  if (!l.quick) return "–";
  if (mode === "AMRAP") return `${l.quick.rounds} rounds${l.quick.extraReps ? ` + ${l.quick.extraReps} reps` : ""}`;
  if (mode === "LADDER") return `top rung ${l.quick.rungs}`;
  return `${l.quick.rounds} rounds done`;
}

// ---------- 4×4 ----------

export function FourByFourScreen() {
  return (
    <WithActiveRun>
      <FourByFourSetup />
    </WithActiveRun>
  );
}

function FourByFourSetup() {
  const { variant } = useSessionQuery();
  const settings = useSettings();
  const progression = useProgression();
  const [mode, setMode] = useState(0);
  const t = sessionById.get("C")!;
  if (!settings || !progression) return <Page title="Norwegian 4×4" back="/train">{null}</Page>;
  const z = zones(settings.age);
  const st = stageOf("4x4", progression.get("4x4"));
  const short = variant === "short";
  const intervals = short ? 2 : (st?.intervals ?? 4);
  const m = FOURBYFOUR_MODES[mode];
  return (
    <Page title="Norwegian 4×4" back="/train/session?id=C">
      <WhyCards ids={["why-4x4"]} />
      <Card title="Mode">
        <div className="grid grid-cols-2 gap-2">
          {FOURBYFOUR_MODES.map((x, i) => (
            <button
              key={x.label}
              type="button"
              aria-pressed={i === mode}
              onClick={() => setMode(i)}
              className={`min-h-14 rounded-2xl text-lg ${i === mode ? "bg-accent text-accent-ink font-semibold" : "bg-surface-2"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-base text-muted">{m.note}</p>
      </Card>
      <Card title="Heart-rate zones">
        <p className="text-sm text-muted">HRmax = 211 − 0.64 × age ({settings.age}) ≈ {z.max} bpm</p>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-2 p-2">
            <dt className="text-xs text-muted">Warm-up</dt>
            <dd className="text-lg tabular">
              {z.warmup[0]}–{z.warmup[1]}
            </dd>
          </div>
          <div className="rounded-xl bg-accent/15 p-2 text-accent">
            <dt className="text-xs">Work</dt>
            <dd className="text-lg tabular">
              {z.work[0]}–{z.work[1]}
            </dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-2">
            <dt className="text-xs text-muted">Recovery</dt>
            <dd className="text-lg tabular">~{z.recovery}</dd>
          </div>
        </dl>
        <p className="mt-2 text-base">No strap? Work pace = 2–3 words, not a sentence.</p>
      </Card>
      <p className="text-lg">
        Today: {short ? "Short Day: 6 min warm-up + 2 intervals + 4 min cool-down" : `${st?.label ?? "4 intervals"}`}
      </p>
      <Button
        variant="primary"
        big
        onClick={() => {
          const segs = build4x4(t, short ? "short" : "full", intervals).map((s) => ({
            ...s,
            items: s.items.map((i) => ({ ...i, exerciseId: m.id })),
          }));
          void begin({ kind: "4x4", templateId: "C", variant: short ? "short" : "full", run: createRun(segs, Date.now()), mode: m.label, hr: [] });
        }}
      >
        Start 4×4
      </Button>
      <p className="text-sm text-muted">Timings and heart-rate targets come from NTNU (see Credits), not from the podcast.</p>
    </Page>
  );
}

// ---------- Follow-along (M, Daily 10, Z) ----------

export function FollowScreen() {
  return (
    <WithActiveRun>
      <FollowSetup />
    </WithActiveRun>
  );
}

function FollowSetup() {
  const { id, variant } = useSessionQuery();
  const plan = useSessionPlan(id ?? "DAILY10", variant, false);
  if (!plan) return null;
  const t = plan.template;
  const segs = followAlong(plan.blocks);
  return (
    <Page title={sessionLabel(t)} back={`/train/session?id=${t.id}`}>
      <WhyCards ids={t.whyCardIds} />
      <p className="text-lg">
        One move at a time: holds count down and move on by themselves; for reps, tap Next when done.
        {t.type === "mobility" ? " Slow, nose breathing." : ""}
      </p>
      <p className="text-base text-muted">
        {segs.length} steps · about {variant === "short" ? t.shortMin : t.fullMin} min
      </p>
      <Button variant="primary" big onClick={() => void begin({ kind: "follow", templateId: t.id, variant, run: createRun(segs, Date.now()) })}>
        Start
      </Button>
    </Page>
  );
}

// ---------- Summary / save ----------

function completedWork(run: Run) {
  const p = position(run, run.endedAt ?? Date.now());
  return run.segments.slice(0, p.done ? run.segments.length : p.index).filter((s) => s.kind === "work");
}

function Summary({ active, onClose }: { active: ActiveRun; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const t = sessionById.get(active.templateId)!;
  const done = completedWork(active.run);
  const mode = t.timer?.mode;
  const [rounds, setRounds] = useState(String(mode === "AMRAP" ? active.run.counters.rounds : done.length));
  const [rungs, setRungs] = useState(String(active.run.counters.rungs));
  const [extra, setExtra] = useState("");
  const [rpe, setRpe] = useState("");
  const [notes, setNotes] = useState("");
  const early = !!active.run.endedAt && !position(active.run, active.run.endedAt).done;

  return (
    <Page title="Nice work">
      <Card>
        <p className="text-2xl font-bold">{sessionLabel(t)}</p>
        {active.mode && <p className="text-muted">Mode: {active.mode}</p>}
        {early && <Badge tone="warn">Ended early: partial session</Badge>}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {active.kind === "quick" && (
            <>
              {mode === "LADDER" ? (
                <Field label="Top rung">
                  <input inputMode="numeric" value={rungs} onChange={(e) => setRungs(e.target.value)} />
                </Field>
              ) : (
                <Field label={mode === "AMRAP" ? "Rounds" : "Rounds done"}>
                  <input inputMode="numeric" value={rounds} onChange={(e) => setRounds(e.target.value)} />
                </Field>
              )}
              <Field label="Extra reps">
                <input inputMode="numeric" value={extra} onChange={(e) => setExtra(e.target.value)} />
              </Field>
            </>
          )}
          <Field label="Session RPE (6–10)">
            <input inputMode="numeric" value={rpe} onChange={(e) => setRpe(e.target.value)} />
          </Field>
        </div>
        {active.hr && active.hr.length > 0 && (
          <p className="mt-2 text-base tabular">HR: {active.hr.map((h, i) => (h ? `#${i + 1} ${h.peak}/${h.avg}` : "")).filter(Boolean).join(" · ")}</p>
        )}
        <Field label="Notes">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Card>
      <Button
        variant="primary"
        big
        onClick={async () => {
          const startedAt = new Date(active.run.startedAt).toISOString();
          const log: Omit<WorkoutLog, "id" | "createdAt" | "updatedAt"> = {
            templateId: t.id,
            date: dateKey(active.run.startedAt, settings?.tz),
            variant: active.variant,
            startedAt,
            endedAt: new Date(active.run.endedAt ?? Date.now()).toISOString(),
            rpe: Number(rpe) || undefined,
            notes: [early ? "Ended early." : "", notes].filter(Boolean).join(" ") || undefined,
            sets: done.map((s, i) => ({ exerciseId: s.items[0]?.exerciseId ?? t.id, setIndex: i, seconds: s.durationSec ?? undefined, done: true })),
            quick: active.kind === "quick" ? { rounds: Number(rounds) || 0, rungs: Number(rungs) || 0, extraReps: Number(extra) || 0 } : undefined,
            hr: active.hr && active.hr.some(Boolean) ? { intervals: active.hr.filter(Boolean) } : undefined,
          };
          // Progression: the 4×4 counts its intervals; follow-alongs move the Big 3; Quick 20s
          // progress by score (shown as a hint), not by stage.
          // What was planned, as one item per work segment, so "did every set" compares like with like.
          const counts = (x: { hrEntry?: boolean; kind: string }) => x.kind === "work" && (active.kind !== "4x4" || x.hrEntry);
          const planned = [{ label: t.name, items: active.run.segments.filter(counts).map((x) => ({ ...x.items[0], sets: 1 })) }];
          // Follow-alongs only move the Big 3 (an optional carry on a walk shouldn't advance the carry).
          const sets =
            active.kind === "4x4"
              ? log.sets.filter((x) => done[x.setIndex]?.hrEntry)
              : log.sets.filter((x) => BIG3_IDS.includes(x.exerciseId));
          const { messages } = await saveWorkout({ ...log, sets }, planned, { progress: active.kind !== "quick" && !early });
          await saveRun(null);
          toast(messages.length ? `Saved. ${messages.join(" · ")}` : "Saved", "good");
          onClose();
          router.push("/train");
        }}
      >
        Save
      </Button>
      <Button
        variant="danger"
        onClick={async () => {
          if (!confirm("Discard without saving?")) return;
          await saveRun(null);
          onClose();
          router.push("/train");
        }}
      >
        Discard
      </Button>
    </Page>
  );
}
