"use client";
// Full-screen timer for Quick 20s, the 4×4 and the mobility follow-alongs. Every number on screen
// is derived from the stored run (src/lib/timer.ts) and the clock, so it is right after a reload,
// a locked phone or switching apps.
import { useEffect, useRef, useState } from "react";
import { buzz, finish, go, speak, tick, unlockAudio, useWakeLock } from "@/client/cues";
import { useSettings } from "@/client/settings";
import { useNow } from "@/client/useNow";
import { mutateRun, type ActiveRun } from "@/client/workouts";
import { advance, bump, cuesBetween, endRun, isPaused, pause, position, resume, type Run } from "@/lib/timer";
import { describeItem, zones } from "@/lib/session";
import { formatClock } from "@/lib/time";
import type { SessionItem } from "@/lib/types";
import { exerciseById } from "@/seed";
import { Button } from "../kit";
import { LoopedDemo } from "../LoopedDemo";

const KIND_LABEL = { prep: "Prep", work: "Work", rest: "Rest", downshift: "Downshift", warmup: "Warm-up", cooldown: "Cool-down" };
const KIND_TONE = {
  prep: "text-info",
  work: "text-accent",
  rest: "text-good",
  downshift: "text-info",
  warmup: "text-info",
  cooldown: "text-info",
};

/** "155–173" for 85–95%, or "~155" when the stage aims at one level (stage 1: ~85%). */
function workTarget(max: number, pct: [number, number] = [0.85, 0.95]): string {
  const [a, b] = pct.map((x) => Math.round(max * x));
  return a === b ? `~${a}` : `${a}–${b}`;
}

function moveName(i?: SessionItem): string {
  if (!i) return "";
  return exerciseById.get(i.exerciseId)?.name ?? i.exerciseId;
}

export function Runner({ active, title, onDone }: { active: ActiveRun; title: string; onDone: (r: ActiveRun) => void }) {
  const now = useNow(250);
  const settings = useSettings();
  const run = active.run;
  const p = position(run, now);
  const prev = useRef(now);
  const finished = useRef(false);
  const [hrPeak, setHrPeak] = useState("");
  const [hrAvg, setHrAvg] = useState("");
  useWakeLock(!p.done && !p.paused);

  // Each control changes the stored run atomically (fast +1 taps never undo each other).
  const change = (fn: (r: Run) => Run, extra: (a: ActiveRun) => Partial<ActiveRun> = () => ({})) =>
    void mutateRun((a) => ({ ...a, ...extra(a), run: fn(a.run) }));

  // Cues for whatever happened since the last frame. After a long gap (app in the background)
  // only the latest change is announced, and no countdown ticks are replayed.
  useEffect(() => {
    const from = prev.current;
    prev.current = now;
    if (!settings) return;
    const gap = now - from;
    for (const c of cuesBetween(run, from, now)) {
      if (c.type === "tick" && gap < 2000) {
        if (settings.notifications.sound) tick();
      } else if (c.type === "segment") {
        if (settings.notifications.sound) go();
        if (settings.notifications.vibrate) buzz(300);
        const seg = run.segments[c.index];
        if (settings.notifications.voice && seg) speak(seg.items[0] ? `${KIND_LABEL[seg.kind]}. ${moveName(seg.items[0])}` : KIND_LABEL[seg.kind]);
      } else if (c.type === "done") {
        if (settings.notifications.sound) finish();
        if (settings.notifications.vibrate) buzz([300, 150, 300]);
      }
    }
  }, [now, run, settings]);

  useEffect(() => {
    if (p.done && !finished.current) {
      finished.current = true;
      onDone(active);
    }
  }, [p.done, active, onDone]);

  const seg = p.segment;
  const current = seg?.items[0];
  const ex = current ? exerciseById.get(current.exerciseId) : undefined;
  // Next-move preview: timed formats that cycle moves carry the next one as items[1]; lists
  // (prep, downshift, AMRAP, ladder, rounds) show all their moves, so preview the next segment.
  const cycles = seg && seg.kind === "work" && seg.mode !== "AMRAP" && seg.mode !== "LADDER" && seg.mode !== "ROUNDS";
  const nextItem = (cycles ? seg?.items[1] : undefined) ?? p.next?.items[0];
  const nextLabel = p.next ? `${KIND_LABEL[p.next.kind]}${nextItem ? ` · ${moveName(nextItem)}` : ""}` : "Finish";
  const z = settings ? zones(settings.age) : null;

  // HR entry for the 4×4: offered during the recovery after each work interval.
  const prevSeg = run.segments[p.index - 1];
  const hrRound = prevSeg?.hrEntry ? (prevSeg.round ?? 0) : 0;
  const hrSaved = hrRound > 0 && !!active.hr?.[hrRound - 1];

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-bg px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-[calc(env(safe-area-inset-bottom)+12px)]">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-3">
        <header className="flex items-center justify-between">
          <span className="text-base text-muted">{title}</span>
          <span className="text-base text-muted tabular">{formatClock(p.totalRemainingMs, false)} left</span>
        </header>

        {seg && (
          <>
            <div className="text-center">
              <p className={`text-2xl font-bold uppercase tracking-wide ${KIND_TONE[seg.kind]}`}>{KIND_LABEL[seg.kind]}</p>
              <p className="text-base text-muted">
                {seg.label}
                {seg.round && seg.rounds && seg.rounds > 1 ? ` · ${seg.round}/${seg.rounds}` : ""}
              </p>
              <p className="text-[96px] leading-none font-bold tabular" role="timer" aria-live="off">
                {p.segRemainingMs === null ? formatClock(p.segElapsedMs, false) : formatClock(p.segRemainingMs, false)}
              </p>
              {p.segRemainingMs === null && <p className="text-lg text-warn">Tap Next when done</p>}
              {p.paused && <p className="text-lg text-warn">Paused</p>}
            </div>

            {z && (seg.kind === "work" || seg.kind === "rest" || seg.kind === "warmup") && active.kind === "4x4" && (
              <p className="text-center text-lg tabular">
                {seg.kind === "work"
                  ? `Target ${workTarget(z.max, active.workPct)} bpm in the last 2 min · 2–3 words, not a sentence`
                  : seg.kind === "warmup"
                    ? `Easy: ${z.warmup[0]}–${z.warmup[1]} bpm`
                    : `Recover to ~${z.recovery} bpm`}
              </p>
            )}

            {seg.kind === "prep" || seg.kind === "downshift" || (seg.mode === "AMRAP" || seg.mode === "LADDER" || seg.mode === "ROUNDS") ? (
              <ul className="rounded-2xl bg-surface p-3 text-lg">
                {seg.items.map((i, k) => (
                  <li key={k} className="flex justify-between gap-2 py-1">
                    <span>{moveName(i)}</span>
                    <span className="text-muted tabular">{seg.mode === "LADDER" && i.reps === "n" ? `${run.counters.rungs + 1}` : describeItem(i)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              current && (
                <div className="text-center">
                  <p className="text-3xl font-bold">{moveName(current)}</p>
                  <p className="text-xl text-muted tabular">
                    {describeItem({ ...current, sets: undefined })}
                    {current.note ? ` · ${current.note}` : ""}
                  </p>
                </div>
              )
            )}

            {ex && <LoopedDemo exercise={ex} size="lg" />}

            {hrRound > 0 && (seg.kind === "rest" || seg.kind === "cooldown") && (
              <div className="rounded-2xl bg-surface p-3">
                <p className="mb-2 text-base">Interval {hrRound} heart rate {hrSaved ? "(saved)" : "(optional)"}</p>
                <div className="grid grid-cols-3 gap-2">
                  <input inputMode="numeric" placeholder="peak" value={hrPeak} onChange={(e) => setHrPeak(e.target.value)} aria-label="Peak HR" />
                  <input inputMode="numeric" placeholder="avg" value={hrAvg} onChange={(e) => setHrAvg(e.target.value)} aria-label="Average HR" />
                  <Button
                    onClick={() => {
                      const entry = { peak: Number(hrPeak) || 0, avg: Number(hrAvg) || 0 };
                      change(
                        (r) => r,
                        (a) => {
                          const hr = [...(a.hr ?? [])];
                          hr[hrRound - 1] = entry;
                          return { hr };
                        },
                      );
                      setHrPeak("");
                      setHrAvg("");
                    }}
                  >
                    Save
                  </Button>
                </div>
              </div>
            )}

            {(seg.mode === "AMRAP" || seg.mode === "LADDER") && (
              <div className="grid grid-cols-3 items-center gap-2">
                <Button big onClick={() => change((r) => bump(r, seg.mode === "AMRAP" ? "rounds" : "rungs", -1))} aria-label="Minus one">
                  −1
                </Button>
                <div className="text-center">
                  <p className="text-sm text-muted">{seg.mode === "AMRAP" ? "Rounds" : "Top rung"}</p>
                  <p className="text-4xl font-bold tabular">{seg.mode === "AMRAP" ? run.counters.rounds : run.counters.rungs}</p>
                </div>
                <Button big variant="primary" onClick={() => change((r) => bump(r, seg.mode === "AMRAP" ? "rounds" : "rungs"))}>
                  +1
                </Button>
              </div>
            )}

            <p className="text-center text-base text-muted">Next: {nextLabel}</p>
          </>
        )}

        <div className="mt-auto grid grid-cols-3 gap-2">
          <Button
            big
            onClick={() => {
              unlockAudio();
              const t = Date.now();
              change((r) => (isPaused(r) ? resume(r, t) : pause(r, t)));
            }}
          >
            {p.paused ? "Resume" : "Pause"}
          </Button>
          <Button
            big
            variant={seg?.durationSec === null ? "primary" : "secondary"}
            onClick={() => {
              unlockAudio();
              const t = Date.now();
              // Only end the segment that was on screen: a double tap never skips two.
              const shown = p.index;
              change((r) => (position(r, t).index === shown ? advance(r, t) : r));
            }}
          >
            Next
          </Button>
          <Button
            big
            variant="danger"
            onClick={() => {
              if (!confirm("End now? What you've done so far is saved.")) return;
              const t = Date.now();
              change((r) => endRun(r, t));
            }}
          >
            End
          </Button>
        </div>
      </div>
    </div>
  );
}
