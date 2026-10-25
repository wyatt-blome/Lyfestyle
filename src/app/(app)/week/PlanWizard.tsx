"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { planWeek } from "@/actions/plan";
import { Icon } from "@/components/icons";
import { Button, Card, Chip, ErrorText, Stepper, textareaClass } from "@/components/ui";
import { MOODS } from "@/lib/moods";

export interface WizardDefaults {
  breakfasts: number;
  lunches: number;
  dinners: number;
  leftoverLunches: number;
  people: number;
  moods: string[];
  note: string;
  includeStaples: boolean;
}

export function PlanWizard({
  weekStart,
  weekWords,
  defaults,
  recipeCount,
  replanning,
}: {
  weekStart: string;
  /** "this week", "next week", "the week of Nov 2" */
  weekWords: string;
  defaults: WizardDefaults;
  recipeCount: number;
  replanning: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [v, setV] = useState(defaults);
  const [error, setError] = useState<string>();
  // When changing an existing plan: keep its meals and only add or drop to match the new counts.
  const [keepMeals, setKeepMeals] = useState(true);
  const [pending, start] = useTransition();
  const set = <K extends keyof WizardDefaults>(k: K, value: WizardDefaults[K]) => setV((s) => ({ ...s, [k]: value }));
  const total = v.breakfasts + v.lunches + v.dinners;
  const maxLeftovers = Math.min(v.lunches, v.dinners);

  if (recipeCount === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="font-display text-xl font-semibold">Add some recipes first</p>
        <p className="mt-2 text-sm text-muted">Import from Pinterest, a website, a photo of a recipe card, or type one in. Then come back to plan the week.</p>
        <Link href="/recipes/new" className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-brand px-5 font-medium text-brand-ink">
          <Icon name="plus" /> Add recipes
        </Link>
      </Card>
    );
  }

  const submit = () =>
    start(async () => {
      setError(undefined);
      const res = await planWeek(weekStart, { ...v, leftoverLunches: Math.min(v.leftoverLunches, maxLeftovers) }, replanning && keepMeals);
      if (!res.ok) setError(res.error);
      else router.replace(`/week?start=${weekStart}`);
    });

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex gap-2 text-xs font-medium text-muted" aria-label="Steps">
        {["How many meals", "What sounds good"].map((s, i) => (
          <li key={s} className={i + 1 === step ? "text-brand" : undefined}>
            <span className={`mr-1.5 inline-grid size-5 place-items-center rounded-full ${i + 1 <= step ? "bg-brand text-brand-ink" : "bg-surface-2"}`}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <Card className="p-5">
          <h2 className="font-display text-2xl font-semibold">How many meals are you cooking {weekWords}?</h2>
          <p className="mt-1 text-sm text-muted">Count only the meals you&apos;ll make at home.</p>
          <div className="mt-5 divide-y divide-line">
            {(
              [
                ["breakfasts", "Breakfasts"],
                ["lunches", "Lunches"],
                ["dinners", "Dinners"],
              ] as const
            ).map(([k, label]) => (
              <div key={k} className="flex items-center justify-between py-3">
                <span className="text-base font-medium">{label}</span>
                <Stepper label={label.toLowerCase()} value={v[k]} onChange={(n) => set(k, n)} />
              </div>
            ))}
            <div className="flex items-center justify-between py-3">
              <span>
                <span className="block text-base font-medium">People eating</span>
                <span className="text-xs text-muted">Recipes are scaled to this</span>
              </span>
              <Stepper label="people" value={v.people} min={1} max={20} onChange={(n) => set("people", n)} />
            </div>
            {maxLeftovers > 0 ? (
              <div className="flex items-center justify-between gap-3 py-3">
                <span>
                  <span className="block text-base font-medium">Lunches from dinner leftovers</span>
                  <span className="text-xs text-muted">We&apos;ll cook those dinners bigger. Less shopping, less waste.</span>
                </span>
                <Stepper label="leftover lunches" value={Math.min(v.leftoverLunches, maxLeftovers)} max={maxLeftovers} onChange={(n) => set("leftoverLunches", n)} />
              </div>
            ) : null}
          </div>
          {replanning ? (
            <label className="mt-4 flex items-start gap-3 rounded-xl bg-surface-2 p-3">
              <input type="checkbox" checked={keepMeals} onChange={(e) => setKeepMeals(e.target.checked)} className="mt-1 size-5 accent-[var(--brand)]" />
              <span>
                <span className="block text-sm font-medium">Keep the meals already planned</span>
                <span className="text-xs text-muted">Only add or drop meals to match the new numbers. Untick to pick every meal fresh.</span>
              </span>
            </label>
          ) : null}
          <div className="mt-5 flex items-center justify-between gap-3">
            {replanning ? (
              <Link href={`/week?start=${weekStart}`} className="text-sm font-medium text-muted">
                Cancel
              </Link>
            ) : (
              <span />
            )}
            <Button variant="primary" size="lg" disabled={total === 0} onClick={() => setStep(2)}>
              Next <Icon name="chevronRight" />
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="p-5">
          <h2 className="font-display text-2xl font-semibold">What are you in the mood for?</h2>
          <p className="mt-1 text-sm text-muted">Pick any that sound good, or skip this to get a mix.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <Chip
                key={m.id}
                selected={v.moods.includes(m.id)}
                onClick={() => set("moods", v.moods.includes(m.id) ? v.moods.filter((x) => x !== m.id) : [...v.moods, m.id])}
              >
                {m.label}
              </Chip>
            ))}
          </div>
          <label className="mt-5 block">
            <span className="text-sm font-medium">Anything else?</span>
            <textarea
              value={v.note}
              onChange={(e) => set("note", e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="e.g. something with salmon, use up the ground turkey, nothing too heavy"
              className={`${textareaClass} mt-1.5`}
            />
          </label>
          <label className="mt-4 flex items-start gap-3">
            <input type="checkbox" checked={v.includeStaples} onChange={(e) => set("includeStaples", e.target.checked)} className="mt-1 size-5 accent-[var(--brand)]" />
            <span>
              <span className="block text-sm font-medium">Include staples that are due</span>
              <span className="text-xs text-muted">Meals you marked as staples come back on their schedule.</span>
            </span>
          </label>
          <ErrorText>{error}</ErrorText>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <Icon name="chevronLeft" /> Back
            </Button>
            <Button variant="primary" size="lg" busy={pending} onClick={submit}>
              <Icon name="sparkle" /> {replanning ? "Update my plan" : "Recommend meals"}
            </Button>
          </div>
          {replanning ? (
            <p className="mt-3 text-right text-xs text-muted">
              {keepMeals ? "Meals already planned stay; only the new ones are picked." : `This replaces every meal planned for ${weekWords}.`}
            </p>
          ) : null}
        </Card>
      )}
    </div>
  );
}
