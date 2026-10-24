"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setRating } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { StarRating } from "@/components/Stars";
import { Button, cx, Sheet, Stepper } from "@/components/ui";
import { isSectionHeader } from "@/lib/ingredients/parse";
import { scaleLine } from "@/lib/ingredients/scale";
import { stepTimers } from "@/lib/time";

interface Timer {
  id: number;
  label: string;
  endsAt: number;
  seconds: number;
  done: boolean;
}

/** Steps with their section ("For the sauce:") carried onto the step that follows it. */
function stepsWithSections(steps: string[]): { text: string; section: string | null }[] {
  const out: { text: string; section: string | null }[] = [];
  let section: string | null = null;
  for (const s of steps) {
    if (/:\s*$/.test(s) && s.length < 60) {
      section = s.replace(/:\s*$/, "");
      continue;
    }
    out.push({ text: s, section });
    section = null;
  }
  return out;
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** Keep the screen on while cooking, where the browser allows it. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen");
      } catch {
        /* not allowed (low battery, older phone): the screen may dim */
      }
    };
    void request();
    const onVisible = () => void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}

/** Only called from event handlers and timers. */
const timestamp = () => Date.now();

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.3);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* no sound available */
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

export function CookMode(props: {
  id: string;
  title: string;
  baseServings: number | null;
  servings: number;
  ingredients: string[];
  steps: string[];
  notes: string | null;
  /** the original recipe pages, to check against while cooking */
  photos: string[];
}) {
  useWakeLock();
  const [showPhoto, setShowPhoto] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const steps = useMemo(() => stepsWithSections(props.steps), [props.steps]);
  // 0 = gather ingredients, 1..n = steps, n+1 = finished
  const [stage, setStage] = useState(0);
  const [servings, setServings] = useState(props.servings);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [showIngredients, setShowIngredients] = useState(false);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [rating, setRatingState] = useState<number | null>(null);
  const nextId = useRef(1);
  const factor = props.baseServings ? servings / props.baseServings : 1;
  const lines = useMemo(() => props.ingredients.map((l) => scaleLine(l, factor)), [props.ingredients, factor]);
  const last = steps.length + 1;

  const go = useCallback((d: number) => setStage((s) => Math.max(0, Math.min(last, s + d))), [last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Tick while timers run; ring once when each one finishes.
  useEffect(() => {
    if (!timers.some((t) => !t.done)) return;
    const t = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setTimers((list) => {
        let rang = false;
        const next = list.map((x) => {
          if (!x.done && x.endsAt <= at) {
            rang = true;
            return { ...x, done: true };
          }
          return x;
        });
        if (rang) beep();
        return rang ? next : list;
      });
    }, 500);
    return () => clearInterval(t);
  }, [timers]);

  const startTimer = (label: string, seconds: number) => {
    const at = timestamp();
    setNow(at);
    const id = nextId.current++;
    setTimers((list) => [...list, { id, label, seconds, endsAt: at + seconds * 1000, done: false }]);
  };

  const step = stage >= 1 && stage <= steps.length ? steps[stage - 1] : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg pt-[env(safe-area-inset-top)]">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Link href={`/recipes/${props.id}`} aria-label="Stop cooking" className="grid size-10 place-items-center rounded-full hover:bg-surface-2">
          <Icon name="x" />
        </Link>
        <p className="min-w-0 flex-1 truncate font-display text-lg font-semibold">{props.title}</p>
        {stage > 0 && stage < last && lines.length ? (
          <Button size="sm" variant="ghost" onClick={() => setShowIngredients(true)}>
            Ingredients
          </Button>
        ) : null}
        {props.photos.length ? (
          <button type="button" onClick={() => setShowPhoto(true)} aria-label="Show the recipe photo" className="shrink-0 overflow-hidden rounded-lg border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={props.photos[0]} alt="" className="h-10 w-8 object-cover" />
          </button>
        ) : null}
      </header>

      {showPhoto ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 pt-[env(safe-area-inset-top)]" role="dialog" aria-label="Recipe photo">
          <div className="flex items-center justify-between px-3 py-2 text-white">
            <span className="text-sm">{zoomed ? "Tap the photo to fit" : "Tap the photo to zoom"}</span>
            <button type="button" onClick={() => setShowPhoto(false)} aria-label="Close photo" className="grid size-10 place-items-center rounded-full bg-white/10">
              <Icon name="x" />
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <div className={cx("flex flex-col items-center gap-3 p-2", zoomed && "w-[220%]")}>
              {props.photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Page ${i + 1}`} onClick={() => setZoomed((z) => !z)} className="w-full rounded-lg bg-white object-contain" />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex gap-1 px-4 pt-3" aria-hidden>
        {Array.from({ length: steps.length + 1 }, (_, i) => (
          <div key={i} className={cx("h-1.5 flex-1 rounded-full", i < stage ? "bg-brand" : i === stage ? "bg-brand/60" : "bg-surface-2")} />
        ))}
      </div>

      <main className="flex-1 overflow-y-auto px-5 py-5">
        {stage === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-display text-3xl font-semibold">Get everything out</h1>
              {props.baseServings ? (
                <div className="flex flex-col items-center">
                  <Stepper label="servings" value={servings} min={1} max={60} onChange={setServings} />
                  <span className="text-xs text-muted">servings</span>
                </div>
              ) : null}
            </div>
            {factor !== 1 ? <p className="text-sm text-muted">Amounts adjusted from {props.baseServings} servings.</p> : null}
            {lines.length ? (
              <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
                {lines.map((line, i) =>
                  isSectionHeader(line) ? (
                    <li key={i} className="bg-surface-2 px-4 py-2 text-sm font-semibold">
                      {line}
                    </li>
                  ) : (
                    <li key={i}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked.has(i)}
                        onClick={() =>
                          setChecked((c) => {
                            const n = new Set(c);
                            if (n.has(i)) n.delete(i);
                            else n.add(i);
                            return n;
                          })
                        }
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-lg"
                      >
                        <span className={cx("grid size-7 shrink-0 place-items-center rounded-lg border-2", checked.has(i) ? "border-brand bg-brand text-brand-ink" : "border-line")}>
                          {checked.has(i) ? <Icon name="check" className="size-4" /> : null}
                        </span>
                        <span className={cx(checked.has(i) && "text-muted line-through")}>{line}</span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p className="text-muted">No ingredients saved for this recipe.</p>
            )}
          </div>
        ) : step ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted">
              Step {stage} of {steps.length}
              {step.section ? ` · ${step.section}` : ""}
            </p>
            <p className="text-2xl leading-relaxed sm:text-3xl">{step.text}</p>
            {stepTimers(step.text).length ? (
              <div className="flex flex-wrap gap-2">
                {stepTimers(step.text).map((t, i) => (
                  <Button key={i} onClick={() => startTimer(t.label, t.seconds)}>
                    <Icon name="clock" className="size-4" /> Start {t.label} timer
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : stage === last ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 pt-8 text-center">
            <Icon name="check" className="size-12 text-brand" />
            <h1 className="font-display text-3xl font-semibold">Enjoy!</h1>
            <p className="text-muted">How did it turn out?</p>
            <StarRating
              value={rating}
              onChange={(r) => {
                setRatingState(r);
                void setRating(props.id, r);
              }}
              size="size-10"
            />
            {props.notes ? <p className="whitespace-pre-line text-sm text-muted">{props.notes}</p> : null}
            <Link href={`/recipes/${props.id}`} className="mt-4 inline-flex h-12 items-center rounded-full bg-brand px-6 font-medium text-brand-ink">
              Back to the recipe
            </Link>
          </div>
        ) : (
          <div className="mx-auto max-w-md pt-8 text-center">
            <p className="font-display text-2xl font-semibold">No directions saved</p>
            <Link href={`/recipes/${props.id}/edit`} className="mt-3 inline-block font-medium text-brand underline underline-offset-4">
              Add the steps
            </Link>
          </div>
        )}
      </main>

      {timers.length ? (
        <div className="flex flex-col gap-1 border-t border-line bg-surface px-4 py-2">
          {timers.map((t) => {
            const left = (t.endsAt - now) / 1000;
            return (
              <div key={t.id} className={cx("flex items-center gap-3 rounded-xl px-3 py-1.5", t.done && "animate-pulse bg-accent-soft")}>
                <Icon name="clock" className={cx("size-5", t.done ? "text-accent" : "text-brand")} />
                <span className="flex-1 text-sm">{t.label}</span>
                <span className="font-mono text-lg font-semibold tabular-nums">{t.done ? "Done!" : clock(left)}</span>
                <button
                  type="button"
                  aria-label={t.done ? "Dismiss timer" : "Cancel timer"}
                  onClick={() => setTimers((list) => list.filter((x) => x.id !== t.id))}
                  className="grid size-8 place-items-center rounded-full hover:bg-surface-2"
                >
                  <Icon name="x" className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {stage < last ? (
        <nav className="grid grid-cols-2 gap-3 border-t border-line px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <Button size="lg" variant="secondary" disabled={stage === 0} onClick={() => go(-1)}>
            <Icon name="chevronLeft" /> Back
          </Button>
          <Button size="lg" variant="primary" onClick={() => go(1)}>
            {stage === 0 ? "Start cooking" : stage === steps.length ? "Finish" : "Next"} <Icon name="chevronRight" />
          </Button>
        </nav>
      ) : null}

      <Sheet open={showIngredients} onClose={() => setShowIngredients(false)} title="Ingredients">
        <ul className="flex flex-col divide-y divide-line">
          {lines.map((line, i) => (
            <li key={i} className={cx("py-2", isSectionHeader(line) && "font-semibold", checked.has(i) && "text-muted")}>
              {line}
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
