"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { buzz, finish as finishBeep, go, unlockAudio, useWakeLock } from "@/client/cues";
import { useDeloadReasons, useSessionPlan } from "@/client/sessionPlan";
import { useSettings } from "@/client/settings";
import { useNow } from "@/client/useNow";
import { mutateDraft, saveDraft, saveWorkout, useDraft, useLastLog, type Draft } from "@/client/workouts";
import { buildRows, prefill } from "@/lib/logger";
import { describeItem } from "@/lib/session";
import { dateKey, formatClock } from "@/lib/time";
import type { WorkoutSet } from "@/lib/types";
import { exerciseById } from "@/seed";
import { Button, Card, Field, Page, Sheet } from "../kit";
import { LoopedDemo } from "../LoopedDemo";
import { sessionLabel } from "../TodayCard";
import { useToast } from "../Toast";
import { LongFastBlock } from "../train/LongFastBlock";
import { useSessionQuery } from "../train/useQuery";

const RPES = [6, 7, 8, 9, 10];

const STALE_MS = 12 * 3_600_000;

function isStale(d: Draft, now: number): boolean {
  return now - Date.parse(d.startedAt) > STALE_MS;
}

export function LoggerScreen() {
  const { id } = useSessionQuery();
  return (
    <LongFastBlock id={id ?? "A"}>
      {/* Keyed by session, so moving between ?id= values starts the logger afresh. */}
      <Logger key={id} />
    </LongFastBlock>
  );
}

function Logger() {
  const { id, variant, deload: qDeload } = useSessionQuery();
  const router = useRouter();
  const toast = useToast();
  const now = useNow(500);
  const settings = useSettings();
  const reasons = useDeloadReasons(now) ?? [];
  const deload = qDeload ?? reasons.length > 0;
  const plan = useSessionPlan(id, variant, deload, reasons);
  const last = useLastLog(id);
  const draft = useDraft();
  const [finishOpen, setFinishOpen] = useState(false);
  const [rpe, setRpe] = useState<number | undefined>();
  const [notes, setNotes] = useState("");
  const [openDemo, setOpenDemo] = useState<number | null>(null);
  const started = useRef(false);
  const [saving, setSaving] = useState(false);
  // An unfinished session of another kind is never replaced silently.
  const otherDraft = draft && plan && draft.templateId !== plan.template.id && !isStale(draft, now) ? draft : null;

  // Start (or resume) the draft once the plan and last log are known. A draft older than
  // 12 hours is yesterday's unfinished session: start fresh rather than log it under today.
  useEffect(() => {
    if (!plan || last === undefined || draft === undefined || started.current) return;
    if (draft && draft.templateId !== plan.template.id && !isStale(draft, now)) return;
    started.current = true;
    if (draft && draft.templateId === plan.template.id && !isStale(draft, now)) return;
    const rows = buildRows(plan.blocks);
    const fresh: Draft = {
      templateId: plan.template.id,
      variant,
      deload,
      startedAt: new Date().toISOString(),
      blocks: plan.blocks,
      sets: prefill(rows, last),
    };
    void saveDraft(fresh);
  }, [plan, last, draft, variant, deload, now]);

  const active = draft && plan && draft.templateId === plan.template.id && !isStale(draft, now) ? draft : null;
  const rows = useMemo(() => (active ? buildRows(active.blocks) : []), [active]);
  useWakeLock(!!active);

  // Rest timer end cue.
  useEffect(() => {
    if (!active?.rest || active.rest.beeped || now < active.rest.until) return;
    if (settings?.notifications.sound) go();
    if (settings?.notifications.vibrate) buzz([200, 100, 200]);
    void mutateDraft((d) => (d.rest ? { ...d, rest: { ...d.rest, beeped: true } } : d));
  }, [now, active, settings]);

  if (!id || !plan) return <Page title="Log" back="/train">{null}</Page>;
  if (otherDraft) {
    return (
      <Page title={sessionLabel(plan.template)} back="/train">
        <Card title="Unfinished session">
          <p className="mb-3">You have an unfinished {otherDraft.templateId} session from {formatClock(now - Date.parse(otherDraft.startedAt), false)} ago.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="primary" onClick={() => router.push(`/train/log?id=${otherDraft.templateId}&v=${otherDraft.variant}&d=${otherDraft.deload ? 1 : 0}`)}>
              Resume it
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirm(`Discard the unfinished ${otherDraft.templateId} session?`)) await saveDraft(null);
              }}
            >
              Discard it
            </Button>
          </div>
        </Card>
      </Page>
    );
  }
  if (!active) return <Page title={sessionLabel(plan.template)} back={`/train/session?id=${id}`}>{null}</Page>;

  // Every change goes through mutateDraft, so taps in quick succession never undo each other.
  const patchSet = (i: number, changes: Partial<WorkoutSet>) =>
    void mutateDraft((d) => ({ ...d, sets: d.sets.map((x, j) => (j === i ? { ...x, ...changes } : x)) }));
  const doneCount = active.sets.filter((s) => s.done).length;
  const restLeft = active.rest ? active.rest.until - now : 0;

  return (
    <Page title={sessionLabel(plan.template)} back={`/train/session?id=${id}`}>
      <p className="text-base text-muted">
        {doneCount}/{rows.length} sets · {active.deload ? "deload, nothing to failure · " : ""}RPE 6–8, never grinding
      </p>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => {
          const s = active.sets[i];
          const ex = exerciseById.get(r.item.exerciseId);
          const prevRow = rows[i - 1];
          const header =
            !prevRow || r.blockIndex !== prevRow.blockIndex || r.round !== prevRow.round ? (
              <h2 key={`h${i}`} className="mt-3 text-lg font-semibold">
                {r.blockLabel}
                {r.rounds > 1 ? ` · round ${r.round}/${r.rounds}` : ""}
              </h2>
            ) : null;
          return (
            <div key={i}>
              {header}
              <div className={`rounded-2xl p-3 ${s.done ? "bg-good/10" : "bg-surface"}`}>
                <div className="flex items-center gap-3">
                  <button type="button" className="flex-1 text-left" onClick={() => setOpenDemo(openDemo === i ? null : i)}>
                    <span className="block text-lg">{ex?.name}</span>
                    <span className="text-sm text-muted">{describeItem(r.item)}{r.item.note ? ` · ${r.item.note}` : ""}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={s.done ? "Mark not done" : "Mark set done"}
                    aria-pressed={s.done}
                    className={`min-h-14 min-w-14 rounded-2xl text-2xl ${s.done ? "bg-good text-bg" : "border-2 border-line"}`}
                    onClick={() => {
                      unlockAudio();
                      const t = Date.now();
                      void mutateDraft((d) => {
                        const done = !d.sets[i].done;
                        const sets = d.sets.map((x, j) => (j === i ? { ...x, done } : x));
                        const rest = done && r.restAfter > 0 ? { until: t + r.restAfter * 1000, total: r.restAfter } : d.rest;
                        return { ...d, sets, rest };
                      });
                    }}
                  >
                    ✓
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {r.item.reps !== undefined && (
                    <NumberBox label="reps" value={s.reps} onChange={(v) => patchSet(i, { reps: v })} />
                  )}
                  {r.item.seconds !== undefined && (
                    <NumberBox label="sec" value={s.seconds} onChange={(v) => patchSet(i, { seconds: v })} />
                  )}
                  {r.item.meters !== undefined && (
                    <NumberBox label="m" value={s.meters} onChange={(v) => patchSet(i, { meters: v })} />
                  )}
                  {(r.item.loadLb !== undefined || ex?.equipment === "dumbbell" || ex?.equipment === "kettlebell") && (
                    <NumberBox label="lb" value={s.loadLb} onChange={(v) => patchSet(i, { loadLb: v })} />
                  )}
                </div>
                {s.done && (
                  <div className="mt-2 flex items-center gap-1" role="group" aria-label="Set RPE">
                    <span className="mr-1 text-sm text-muted">RPE</span>
                    {RPES.map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-pressed={s.rpe === n}
                        onClick={() => patchSet(i, { rpe: s.rpe === n ? undefined : n })}
                        className={`min-h-12 flex-1 rounded-xl text-base ${s.rpe === n ? "bg-accent text-accent-ink" : "bg-surface-2"}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}
                {openDemo === i && ex && (
                  <div className="mt-3">
                    <LoopedDemo exercise={ex} />
                    <ul className="mt-2 list-disc pl-5 text-base">
                      {ex.cues.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="primary" big onClick={() => setFinishOpen(true)}>
          Finish
        </Button>
        <Button
          big
          variant="danger"
          onClick={async () => {
            if (!confirm("Discard this session?")) return;
            await saveDraft(null);
            router.push("/train");
          }}
        >
          Discard
        </Button>
      </div>

      {active.rest && restLeft > 0 && (
        <>
        {/* Room for the rest bar, so it never covers Finish. */}
        <div aria-hidden className="h-28" />
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+68px)] z-30 px-4">
          <Card className="mx-auto flex max-w-xl items-center justify-between gap-3 border border-accent">
            <span>
              <span className="block text-sm text-muted">Rest</span>
              <span className="text-4xl font-bold tabular">{formatClock(restLeft, false)}</span>
            </span>
            <span className="flex gap-2">
              <Button onClick={() => void mutateDraft((d) => (d.rest ? { ...d, rest: { ...d.rest, until: d.rest.until + 15_000, beeped: false } } : d))}>+15 s</Button>
              <Button onClick={() => void mutateDraft((d) => ({ ...d, rest: undefined }))}>Skip</Button>
            </span>
          </Card>
        </div>
        </>
      )}

      <Sheet open={finishOpen} onClose={() => setFinishOpen(false)} title="Finish session">
        <div className="flex flex-col gap-3">
          <p className="text-muted">How hard was it overall?</p>
          <div className="grid grid-cols-5 gap-2">
            {RPES.map((n) => (
              <button key={n} type="button" aria-pressed={rpe === n} onClick={() => setRpe(n)} className={`min-h-12 rounded-xl ${rpe === n ? "bg-accent text-accent-ink" : "bg-surface-2"}`}>
                {n}
              </button>
            ))}
          </div>
          <Field label="Notes">
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button
            variant="primary"
            big
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const { messages } = await saveWorkout(
                  {
                    templateId: active.templateId,
                    date: dateKey(active.startedAt, settings?.tz),
                    variant: active.variant,
                    startedAt: active.startedAt,
                    endedAt: new Date().toISOString(),
                    rpe,
                    notes: notes || undefined,
                    sets: active.sets,
                  },
                  active.blocks,
                  { progress: !active.deload },
                );
                await saveDraft(null);
                if (settings?.notifications.sound) finishBeep();
                toast(messages.length ? `Saved. ${messages.join(" · ")}` : "Session saved", "good");
                router.push("/train");
              } catch (e) {
                toast((e as Error).message || "Couldn't save. Try again.", "bad");
                setSaving(false);
              }
            }}
          >
            Save session
          </Button>
        </div>
      </Sheet>
    </Page>
  );
}

function NumberBox({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="flex items-center gap-1 rounded-xl bg-surface-2 pr-2">
      <input
        inputMode="decimal"
        className="!min-h-12 border-0 bg-transparent text-center text-xl tabular"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
      <span className="text-sm text-muted">{label}</span>
    </label>
  );
}
