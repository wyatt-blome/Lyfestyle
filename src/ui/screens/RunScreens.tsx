"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { unlockAudio } from "@/client/cues";
import { useActiveFast } from "@/client/fasts";
import { sessionById, useDeloadReasons, useSessionPlan } from "@/client/sessionPlan";
import { useSettings } from "@/client/settings";
import { useTodayPlan } from "@/client/today";
import { useNow } from "@/client/useNow";
import { defaultQuick, deloadSafeQuick, saveRun, saveWorkout, useActiveRun, useProgression, useWorkoutLogs, type ActiveRun } from "@/client/workouts";
import { allowedDuringLongFast, longFastActive } from "@/lib/fasting";
import { BIG3_IDS, quickHint, quickScoreOf, stageOf } from "@/lib/progression";
import { FOURBYFOUR_MODES, zones } from "@/lib/session";
import { build4x4, buildQuick20, createRun, endedEarly, finishedSegments, followAlong, programSeconds } from "@/lib/timer";
import { dateKey, weekdayOf } from "@/lib/time";
import type { SessionId, SessionTemplate, WorkoutLog } from "@/lib/types";
import { sessions } from "@/seed";
import { Badge, Button, Card, Field, LinkButton, Notice, Page } from "../kit";
import { sessionLabel } from "../TodayCard";
import { useToast } from "../Toast";
import { LongFastBlock } from "../train/LongFastBlock";
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
  const { id: qId, deload: qDeload } = useSessionQuery();
  const now = useNow(30_000);
  const settings = useSettings();
  const fast = useActiveFast();
  const plan = useTodayPlan(settings, now);
  const logs = useWorkoutLogs();
  const reasons = useDeloadReasons(now) ?? [];
  const [picked, setPicked] = useState<SessionId | null>(null);
  if (!plan || !logs) return <Page title="Quick 20" back="/train">{null}</Page>;
  const deload = qDeload ?? reasons.length > 0;
  const longFast = longFastActive(fast ?? undefined, now);
  const fallback = defaultQuick(logs, plan.week.cycleWeek, deload);
  // Q5 is never run on a deload, whichever way it was picked.
  const id = deloadSafeQuick(picked ?? qId ?? fallback, deload);
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
        <p className="mt-1 text-base text-muted">
          3:00 prep → 15:00 work → 2:00 downshift · {quickMinutes(t)} min
          {plan.weekday === "fri" ? " · then 5 min mobility" : ""}
        </p>
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
          onClick={() => void begin({ kind: "quick", templateId: t.id, variant: "full", deload, run: createRun(buildQuick20(t), Date.now()) })}
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
              className={`flex min-h-16 flex-col items-center justify-center rounded-2xl ${q.id === id ? "bg-accent text-accent-ink" : "border border-line bg-surface-2"}`}
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

/** Timed total, or the listed 20 when part of it is open-ended (Q2's rounds). */
function quickMinutes(t: SessionTemplate): number {
  const segs = buildQuick20(t);
  return segs.some((x) => x.durationSec === null) ? t.fullMin : Math.round(programSeconds(segs) / 60);
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
      <LongFastBlock id="C">
        <FourByFourSetup />
      </LongFastBlock>
    </WithActiveRun>
  );
}

/** 4×4 work target by stage: ~85%, then 85–90%, then 90–95% of HRmax. */
const STAGE_PCT: [number, number][] = [
  [0.85, 0.85],
  [0.85, 0.9],
  [0.9, 0.95],
];

function FourByFourSetup() {
  const { variant, deload: qDeload } = useSessionQuery();
  const settings = useSettings();
  const progression = useProgression();
  const now = useNow(60_000);
  const reasons = useDeloadReasons(now);
  const [mode, setMode] = useState(0);
  const t = sessionById.get("C")!;
  if (!settings || !progression || !reasons) return <Page title="Norwegian 4×4" back="/train">{null}</Page>;
  const z = zones(settings.age);
  const state = progression.get("4x4");
  const st = stageOf("4x4", state);
  const workPct = STAGE_PCT[Math.min(STAGE_PCT.length, state?.stage ?? 1) - 1];
  const short = variant === "short";
  const deload = qDeload ?? reasons.length > 0;
  // Short Day and deloads both do 2 intervals (~60% of 4).
  const intervals = short || deload ? 2 : (st?.intervals ?? 4);
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
              className={`min-h-14 rounded-2xl text-lg ${i === mode ? "bg-accent text-accent-ink font-semibold" : "border border-line bg-surface-2"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-base text-muted">{m.note}</p>
      </Card>
      <p className="text-lg">
        Today: {short ? "Short Day: 6 min warm-up + 2 intervals + 4 min cool-down" : deload ? "Deload: 2 intervals, nothing to failure" : `${st?.label ?? "4 intervals"}`}
      </p>
      <Button
        variant="primary"
        big
        onClick={() => {
          const segs = build4x4(t, short ? "short" : "full", intervals).map((s) => ({
            ...s,
            items: s.items.map((i) => ({ ...i, exerciseId: m.id })),
          }));
          void begin({ kind: "4x4", templateId: "C", variant: short ? "short" : "full", deload, workPct, run: createRun(segs, Date.now()), mode: m.label, hr: [] });
        }}
      >
        Start 4×4
      </Button>
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
      <p className="text-sm text-muted">Timings and heart-rate targets come from NTNU (see Credits), not from the podcast.</p>
    </Page>
  );
}

// ---------- Follow-along (M, Daily 10, Z) ----------

export function FollowScreen() {
  const { id } = useSessionQuery();
  return (
    <WithActiveRun>
      <LongFastBlock id={id ?? "DAILY10"}>
        <FollowSetup />
      </LongFastBlock>
    </WithActiveRun>
  );
}

function FollowSetup() {
  const { id, variant, deload: qDeload } = useSessionQuery();
  const now = useNow(60_000);
  const reasons = useDeloadReasons(now);
  const deload = qDeload ?? (reasons?.length ?? 0) > 0;
  const plan = useSessionPlan(id ?? "DAILY10", variant, deload);
  if (!plan || !reasons) return null;
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
      <Button variant="primary" big onClick={() => void begin({ kind: "follow", templateId: t.id, variant, deload, run: createRun(segs, Date.now()) })}>
        Start
      </Button>
    </Page>
  );
}

// ---------- Summary / save ----------


function Summary({ active, onClose }: { active: ActiveRun; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const settings = useSettings();
  const t = sessionById.get(active.templateId)!;
  // What was actually finished before End (an early end saves a partial session).
  // A summary without an end time means the program ran out, so every segment finished.
  const done = finishedSegments(active.run, active.run.endedAt ?? Number.POSITIVE_INFINITY).filter((s) => s.kind === "work");
  const [busy, setBusy] = useState(false);
  const mode = t.timer?.mode;
  const [rounds, setRounds] = useState(String(mode === "AMRAP" ? active.run.counters.rounds : done.length));
  const [rungs, setRungs] = useState(String(active.run.counters.rungs));
  const [extra, setExtra] = useState("");
  const [rpe, setRpe] = useState("");
  const [notes, setNotes] = useState("");
  const early = endedEarly(active.run);

  return (
    <Page title="Nice work">
      <p className="text-base text-muted">Save or discard this session before starting another.</p>
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
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
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
            // Progression (D17): the 4×4 counts finished intervals, follow-alongs move the Big 3 only,
            // Quick 20s progress by score. Planned = one item per counted segment, so "every set
            // done" compares like with like; an early end simply finishes fewer of them.
            const counts = (x: { hrEntry?: boolean; kind: string; items: { exerciseId: string }[] }) =>
              x.kind === "work" && (active.kind === "4x4" ? !!x.hrEntry : BIG3_IDS.includes(x.items[0]?.exerciseId ?? ""));
            const planned = [{ label: t.name, items: active.run.segments.filter(counts).map((x) => ({ ...x.items[0], sets: 1 })) }];
            const progress = active.kind !== "quick" && !active.deload && !(active.kind === "4x4" && active.variant === "short");
            const { messages } = await saveWorkout(log, planned, {
              progress,
              progressSets: (x) => !!done[x.setIndex] && counts(done[x.setIndex]),
            });
            await saveRun(null);
            toast(messages.length ? `Saved. ${messages.join(" · ")}` : "Saved", "good");
            onClose();
            // Friday's Quick 20 is "20 + 5 min mobility": go straight to the short Daily 10.
            const friday = weekdayOf(dateKey(Date.now(), settings?.tz)) === 5;
            router.push(active.kind === "quick" && friday && !early ? "/train/follow?id=DAILY10&v=short" : "/train");
          } catch (e) {
            toast((e as Error).message || "Couldn't save. Try again.", "bad");
            setBusy(false);
          }
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
