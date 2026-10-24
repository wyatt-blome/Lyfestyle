"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { addMeal, approvePlan, removeMeal, swapMeal, swapOptions, updateMeal, type SwapOption } from "@/actions/plan";
import { Icon } from "@/components/icons";
import { StarsShown } from "@/components/Stars";
import { Button, Card, cx, ErrorText, inputClass, Sheet, Stepper } from "@/components/ui";
import type { WeekRequestJson } from "@/db/schema";
import { dayName } from "@/lib/dates";
import { MOODS_BY_ID, type MealType } from "@/lib/moods";
import { formatMinutes } from "@/lib/time";

export interface RecipeLite {
  id: string;
  title: string;
  imageUrl: string | null;
  mealTypes: string[];
  totalMinutes: number | null;
  timeEstimated: boolean;
  rating: number | null;
  isFavorite: boolean;
  isStaple: boolean;
}

export interface MealView {
  id: string;
  mealType: MealType;
  day: number | null;
  servings: number;
  extraServings: number;
  recipe: RecipeLite | null;
  leftoversOf: { id: string; day: number | null; title: string } | null;
}

const SECTIONS: { type: MealType; title: string; one: string }[] = [
  { type: "dinner", title: "Dinners", one: "dinner" },
  { type: "lunch", title: "Lunches", one: "lunch" },
  { type: "breakfast", title: "Breakfasts", one: "breakfast" },
];

function Thumb({ src, className }: { src: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" className={cx("object-cover", className)} />
  ) : (
    <div className={cx("grid place-items-center bg-brand-soft text-brand", className)}>
      <Icon name="leaf" className="size-6" />
    </div>
  );
}

export function WeekPlan(props: {
  planId: string;
  weekStart: string;
  status: "draft" | "approved";
  approvedBy: string | null;
  hasList: boolean;
  meals: MealView[];
  recipes: RecipeLite[];
  leftovers: { name: string; text: string }[];
  store: "walmart" | "sams";
  request: WeekRequestJson | null;
}) {
  const { planId, weekStart, status, meals } = props;
  const router = useRouter();
  const [swapFor, setSwapFor] = useState<MealView | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | { ok: true; value: unknown }>) =>
    start(async () => {
      setError(undefined);
      const res = await fn();
      if (!res.ok && "error" in res) setError(res.error);
      router.refresh();
    });

  const approve = () =>
    start(async () => {
      setError(undefined);
      const res = await approvePlan(planId);
      if (!res.ok) setError(res.error);
      else router.push(`/list?week=${weekStart}`);
    });

  const dinners = meals.filter((m) => m.mealType === "dinner" && m.recipe);
  const moods = props.request?.moods.map((id) => MOODS_BY_ID.get(id)?.label).filter(Boolean) ?? [];

  return (
    <div className="flex flex-col gap-5">
      {status === "approved" ? (
        <Card className="flex items-center gap-3 border-brand/30 bg-brand-soft p-4">
          <Icon name="check" className="size-6 shrink-0 text-brand" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">Plan approved{props.approvedBy ? ` by ${props.approvedBy}` : ""}</p>
            <p className="text-muted">Your grocery list is ready. Changing a meal will ask you to approve again.</p>
          </div>
          <Link href={`/list?week=${weekStart}`} className="inline-flex h-10 shrink-0 items-center rounded-full bg-brand px-4 text-sm font-medium text-brand-ink">
            Open list
          </Link>
        </Card>
      ) : props.hasList ? (
        <Card className="border-warn/30 bg-warn-soft p-4 text-sm">
          <p className="font-semibold">The plan changed since the list was made</p>
          <p className="text-muted">Approve again to update the grocery list. Items you already checked off stay checked.</p>
        </Card>
      ) : (
        <p className="text-sm text-muted">
          Here&apos;s a plan{moods.length ? ` leaning ${moods.join(", ").toLowerCase()}` : ""}. Swap anything you don&apos;t love, then approve it to build your grocery list.
        </p>
      )}

      {props.leftovers.length ? (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="leaf" className="size-5 text-brand" /> Leftover watch
          </div>
          <p className="mt-1 text-sm text-muted">After buying whole packages, this week would leave:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {props.leftovers.map((l) => (
              <li key={l.name} className="rounded-full bg-warn-soft px-3 py-1 text-sm">
                {l.text} {l.name.toLowerCase()}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Tap Swap on a meal: options that use these up are listed first.</p>
        </Card>
      ) : meals.some((m) => m.recipe) ? (
        <p className="flex items-center gap-2 text-sm text-brand">
          <Icon name="leaf" className="size-5" /> Nothing perishable left over this week.
        </p>
      ) : null}

      {SECTIONS.map((section) => {
        const list = meals.filter((m) => m.mealType === section.type);
        if (!list.length && !(props.request && props.request[`${section.type}s` as "dinners"] > 0)) {
          return (
            <button
              key={section.type}
              type="button"
              disabled={pending}
              onClick={() => run(() => addMeal(planId, section.type))}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-muted"
            >
              <Icon name="plus" className="size-4" /> Add a {section.one}
            </button>
          );
        }
        return (
          <section key={section.type} aria-labelledby={`h-${section.type}`}>
            <h2 id={`h-${section.type}`} className="mb-2 flex items-baseline justify-between">
              <span className="font-display text-xl font-semibold">{section.title}</span>
              <span className="text-sm text-muted">{list.length}</span>
            </h2>
            <ul className="flex flex-col gap-3">
              {list.map((m) => (
                <li key={m.id}>
                  <MealCard
                    meal={m}
                    weekStart={weekStart}
                    dinners={dinners}
                    busy={pending}
                    onSwap={() => setSwapFor(m)}
                    onRemove={() => run(() => removeMeal(m.id))}
                    onDay={(day) => run(() => updateMeal(m.id, { day }))}
                    onServings={(servings) => run(() => updateMeal(m.id, { servings }))}
                    onLeftovers={(id) => run(() => updateMeal(m.id, { leftoverOfId: id }))}
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => addMeal(planId, section.type))}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-sm text-muted"
            >
              <Icon name="plus" className="size-4" /> Add a {section.one}
            </button>
          </section>
        );
      })}

      <Link href={`/week?start=${weekStart}&replan=1`} className="self-center text-sm text-muted underline underline-offset-4">
        Start over with new answers
      </Link>

      <div className="safe-bottom fixed inset-x-0 bottom-16 z-20 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          <ErrorText>{error}</ErrorText>
          {status === "approved" ? (
            <Link href={`/list?week=${weekStart}`} className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-ink">
              <Icon name="cart" /> Go to grocery list
            </Link>
          ) : (
            <Button variant="primary" size="lg" busy={pending} onClick={approve} disabled={!meals.some((m) => m.recipe)}>
              <Icon name="check" /> {props.hasList ? "Approve changes and update list" : "Approve plan and make my list"}
            </Button>
          )}
        </div>
      </div>
      <div className="h-20" aria-hidden />

      <SwapSheet
        meal={swapFor}
        recipes={props.recipes}
        onClose={() => setSwapFor(null)}
        onPick={(recipeId) => {
          const m = swapFor!;
          setSwapFor(null);
          run(() => swapMeal(m.id, recipeId));
        }}
      />
    </div>
  );
}

function MealCard({
  meal,
  weekStart,
  dinners,
  busy,
  onSwap,
  onRemove,
  onDay,
  onServings,
  onLeftovers,
}: {
  meal: MealView;
  weekStart: string;
  dinners: MealView[];
  busy: boolean;
  onSwap: () => void;
  onRemove: () => void;
  onDay: (day: number | null) => void;
  onServings: (n: number) => void;
  onLeftovers: (dinnerId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const daySelect = (
    <select
      aria-label="Day"
      value={meal.day ?? ""}
      onChange={(e) => onDay(e.target.value === "" ? null : Number(e.target.value))}
      className="h-8 rounded-full border border-line bg-surface px-2 text-xs font-medium"
    >
      <option value="">Any day</option>
      {Array.from({ length: 7 }, (_, i) => (
        <option key={i} value={i}>
          {dayName(weekStart, i)}
        </option>
      ))}
    </select>
  );

  if (meal.leftoversOf) {
    return (
      <Card className="flex items-center gap-3 p-3">
        <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
          <Icon name="repeat" className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Leftovers</p>
          <p className="truncate font-medium">{meal.leftoversOf.title}</p>
          <div className="mt-1 flex items-center gap-2">{daySelect}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onLeftovers(null)} disabled={busy}>
          Cook instead
        </Button>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-3 p-3">
        {meal.recipe ? (
          <Link href={`/recipes/${meal.recipe.id}`} className="shrink-0">
            <Thumb src={meal.recipe.imageUrl} className="size-20 rounded-xl" />
          </Link>
        ) : (
          <div className="grid size-20 shrink-0 place-items-center rounded-xl border border-dashed border-line text-muted">
            <Icon name="plus" />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">{daySelect}</div>
          {meal.recipe ? (
            <Link href={`/recipes/${meal.recipe.id}`} className="line-clamp-2 font-medium leading-snug">
              {meal.recipe.title}
            </Link>
          ) : (
            <p className="text-muted">No meal picked yet</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            {meal.recipe?.rating ? <StarsShown rating={meal.recipe.rating} /> : null}
            {meal.recipe?.isFavorite ? (
              <span className="flex items-center gap-1 text-accent">
                <Icon name="heart" filled className="size-3.5" /> Favorite
              </span>
            ) : null}
            {meal.recipe?.isStaple ? (
              <span className="flex items-center gap-1 text-brand">
                <Icon name="repeat" className="size-3.5" /> Staple
              </span>
            ) : null}
            {meal.recipe?.totalMinutes ? (
              <span className="flex items-center gap-1">
                <Icon name="clock" className="size-3.5" /> {meal.recipe.timeEstimated ? "~" : ""}
                {formatMinutes(meal.recipe.totalMinutes)}
              </span>
            ) : null}
            <span>
              Serves {meal.servings}
              {meal.extraServings ? ` + ${meal.extraServings} for leftovers` : ""}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
        <Button size="sm" variant="ghost" onClick={onSwap} disabled={busy} className="text-brand">
          <Icon name="swap" className="size-4" /> {meal.recipe ? "Swap" : "Choose"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          More
        </Button>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onRemove} disabled={busy} aria-label="Remove meal" className="text-muted">
          <Icon name="trash" className="size-4" />
        </Button>
      </div>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-line bg-surface-2/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Servings</span>
            <Stepper label="servings" value={meal.servings} min={1} max={30} onChange={onServings} />
          </div>
          {meal.mealType === "lunch" && dinners.length ? (
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Make it leftovers from</span>
              <select defaultValue="" onChange={(e) => e.target.value && onLeftovers(e.target.value)} className="h-9 max-w-[60%] rounded-full border border-line bg-surface px-3">
                <option value="">Choose a dinner…</option>
                {dinners.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.day !== null ? `${dayName(weekStart, d.day, true)}: ` : ""}
                    {d.recipe?.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function SwapSheet({
  meal,
  recipes,
  onClose,
  onPick,
}: {
  meal: MealView | null;
  recipes: RecipeLite[];
  onClose: () => void;
  onPick: (recipeId: string) => void;
}) {
  return (
    <Sheet open={Boolean(meal)} onClose={onClose} title={meal?.recipe ? `Swap ${meal.recipe.title}` : `Choose a ${meal?.mealType ?? "meal"}`}>
      {meal ? <SwapBody key={meal.id} meal={meal} recipes={recipes} onPick={onPick} /> : null}
    </Sheet>
  );
}

function SwapBody({ meal, recipes, onPick }: { meal: MealView; recipes: RecipeLite[]; onPick: (recipeId: string) => void }) {
  const [options, setOptions] = useState<SwapOption[] | null>(null);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    swapOptions(meal.id).then((res) => {
      if (!live) return;
      if (res.ok) setOptions(res.value);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [meal.id]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return recipes.filter((r) => r.title.toLowerCase().includes(q) && r.id !== meal.recipe?.id).slice(0, 30);
  }, [query, recipes, meal]);

  const row = (
    r: { id: string; title: string; imageUrl: string | null; totalMinutes: number | null; timeEstimated: boolean; rating: number | null; isFavorite: boolean },
    reasons?: string[],
  ) => (
    <li key={r.id}>
      <button type="button" onClick={() => onPick(r.id)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-surface-2">
        <Thumb src={r.imageUrl} className="size-14 shrink-0 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 font-medium leading-snug">
            {r.isFavorite ? <Icon name="heart" filled className="size-3.5 shrink-0 text-accent" /> : null}
            <span className="line-clamp-2">{r.title}</span>
          </span>
          {r.rating || r.totalMinutes ? (
            <span className="flex items-center gap-2 text-xs text-muted">
              <StarsShown rating={r.rating} />
              {r.totalMinutes ? `${r.timeEstimated ? "~" : ""}${formatMinutes(r.totalMinutes)}` : null}
            </span>
          ) : null}
          {reasons?.length ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {reasons.slice(0, 3).map((x) => (
                <span
                  key={x}
                  className={cx(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    x.startsWith("Uses up") || x === "Adds little waste" ? "bg-brand-soft text-brand" : x.startsWith("Leaves") ? "bg-warn-soft text-warn" : "bg-surface-2 text-muted",
                  )}
                >
                  {x}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        <Icon name="chevronRight" className="size-4 text-muted" />
      </button>
    </li>
  );

  return (
    <>
      <div className="relative mb-3">
        <Icon name="search" className="pointer-events-none absolute left-3 top-3 size-5 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search all recipes" className={cx(inputClass, "pl-10")} />
      </div>
      <ErrorText>{error}</ErrorText>
      {results ? (
        results.length ? (
          <ul className="flex flex-col gap-1">{results.map((r) => row(r))}</ul>
        ) : (
          <p className="py-6 text-center text-sm text-muted">No recipes match “{query}”.</p>
        )
      ) : options === null && !error ? (
        <div className="flex flex-col gap-2 py-2" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      ) : options?.length ? (
        <>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Best fits for this week</p>
          <ul className="flex flex-col gap-1">{options.map((o) => row(o, o.reasons))}</ul>
        </>
      ) : options ? (
        <p className="py-6 text-center text-sm text-muted">
          No other {meal.mealType} recipes yet. Mark recipes as {meal.mealType} on their page, or add more.
        </p>
      ) : null}
    </>
  );
}
