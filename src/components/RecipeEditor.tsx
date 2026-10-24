"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveRecipe, type RecipeInput } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { Button, Card, Chip, cx, ErrorText, Field, inputClass, textareaClass } from "@/components/ui";
import { isSectionHeader, parseIngredientLine } from "@/lib/ingredients/parse";
import { identify } from "@/lib/ingredients/normalize";
import { MEAL_TYPES, inferMealTypes } from "@/lib/moods";
import { formatMinutes, recipeTime } from "@/lib/time";
import { StarRating } from "./Stars";

export interface EditorValue {
  title: string;
  description: string | null;
  sourceUrl: string | null;
  pinterestUrl: string | null;
  sourceType: RecipeInput["sourceType"];
  imageUrl: string | null;
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  totalMinutes: number | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  mealTypes: string[];
  notes: string | null;
  isFavorite: boolean;
  rating: number | null;
  isStaple: boolean;
  stapleEveryWeeks: number | null;
}

const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s)) || 0));

export function RecipeEditor({
  initial,
  id,
  notice,
  onSaved,
}: {
  initial: EditorValue;
  id?: string;
  notice?: string | null;
  /** when set, saving calls this instead of opening the recipe */
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [ingredients, setIngredients] = useState(initial.ingredients.join("\n"));
  const [steps, setSteps] = useState(initial.steps.join("\n"));
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [mealTypes, setMealTypes] = useState<string[]>(initial.mealTypes.length ? initial.mealTypes : inferMealTypes(initial));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const set = <K extends keyof EditorValue>(k: K, value: EditorValue[K]) => setV((s) => ({ ...s, [k]: value }));

  const preview = useMemo(
    () =>
      ingredients
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 60)
        .map((line) => {
          const header = isSectionHeader(line);
          if (header) return { line, header, item: null as string | null };
          const p = parseIngredientLine(line);
          return { line, header: null, item: p.name ? identify(p.name).name : null };
        }),
    [ingredients],
  );

  const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
  // What the recipe card will show; an estimate from the steps when no times are entered.
  const time = useMemo(
    () => recipeTime({ prepMinutes: v.prepMinutes, cookMinutes: v.cookMinutes, totalMinutes: v.totalMinutes, ingredients: lines(ingredients), steps: lines(steps) }),
    [v.prepMinutes, v.cookMinutes, v.totalMinutes, ingredients, steps],
  );

  const save = () =>
    start(async () => {
      setError(undefined);
      const res = await saveRecipe(
        {
          ...v,
          sourceUrl: v.sourceUrl || null,
          pinterestUrl: v.pinterestUrl || null,
          imageUrl: v.imageUrl || null,
          ingredients: ingredients.split("\n").map((s) => s.trim()).filter(Boolean),
          steps: steps.split("\n").map((s) => s.trim()).filter(Boolean),
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          mealTypes: mealTypes as ("breakfast" | "lunch" | "dinner")[],
          stapleEveryWeeks: v.isStaple ? (v.stapleEveryWeeks ?? 1) : null,
          // Prep + cook wins over a total typed earlier, so changing either keeps them in step.
          totalMinutes: v.prepMinutes || v.cookMinutes ? (v.prepMinutes ?? 0) + (v.cookMinutes ?? 0) : v.totalMinutes,
        },
        id,
      );
      if (!res.ok) setError(res.error);
      else if (onSaved) onSaved(res.value.id);
      else router.push(`/recipes/${res.value.id}`);
    });

  return (
    <div className="flex flex-col gap-5">
      {notice ? <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm">{notice}</p> : null}
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex gap-3">
          {v.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.imageUrl} alt="" referrerPolicy="no-referrer" className="size-24 shrink-0 rounded-xl object-cover" />
          ) : null}
          <div className="flex flex-1 flex-col gap-3">
            <Field label="Recipe name">
              <input value={v.title} onChange={(e) => set("title", e.target.value)} className={inputClass} required />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Serves">
            <input inputMode="numeric" value={v.servings ?? ""} onChange={(e) => set("servings", num(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Prep (min)">
            <input
              inputMode="numeric"
              value={v.prepMinutes ?? ""}
              placeholder={time?.estimated && time.prep ? `~${time.prep}` : undefined}
              onChange={(e) => set("prepMinutes", num(e.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="Cook (min)">
            <input
              inputMode="numeric"
              value={v.cookMinutes ?? ""}
              placeholder={time?.estimated && time.cook ? `~${time.cook}` : undefined}
              onChange={(e) => set("cookMinutes", num(e.target.value))}
              className={inputClass}
            />
          </Field>
        </div>
        {time ? (
          <p className="-mt-2 flex items-center gap-1.5 text-sm text-muted">
            <Icon name="clock" className="size-4" /> Total time {formatMinutes(time.total, time.estimated)}
            {time.estimated ? " (estimated from the steps; type times above to set them)" : ""}
          </p>
        ) : null}
        <div>
          <span className="text-sm font-medium">Rating</span>
          <div className="mt-1">
            <StarRating value={v.rating} onChange={(r) => set("rating", r)} />
          </div>
        </div>
        <div>
          <span className="text-sm font-medium">Good for</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {MEAL_TYPES.map((t) => (
              <Chip key={t.id} selected={mealTypes.includes(t.id)} onClick={() => setMealTypes((m) => (m.includes(t.id) ? m.filter((x) => x !== t.id) : [...m, t.id]))}>
                {t.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip selected={v.isFavorite} onClick={() => set("isFavorite", !v.isFavorite)}>
            <Icon name="heart" filled={v.isFavorite} className="size-4" /> Favorite
          </Chip>
          <Chip selected={v.isStaple} onClick={() => set("isStaple", !v.isStaple)}>
            <Icon name="repeat" className="size-4" /> Staple
          </Chip>
          {v.isStaple ? (
            <select
              aria-label="How often"
              value={v.stapleEveryWeeks ?? 1}
              onChange={(e) => set("stapleEveryWeeks", Number(e.target.value))}
              className="h-9 rounded-full border border-line bg-surface px-3 text-sm"
            >
              <option value={1}>every week</option>
              <option value={2}>every 2 weeks</option>
              <option value={3}>every 3 weeks</option>
              <option value={4}>once a month</option>
            </select>
          ) : null}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Field label="Ingredients" hint="One per line, with amounts (“2 cups shredded cheddar”). Lines ending in a colon are section titles.">
          <textarea value={ingredients} onChange={(e) => setIngredients(e.target.value)} rows={Math.min(18, Math.max(6, preview.length + 2))} className={textareaClass} />
        </Field>
        {preview.length ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">How these go on the grocery list</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {preview.map((p, i) => (
                <li key={i} className="flex justify-between gap-3 border-b border-line/60 py-1">
                  <span className={cx("truncate", p.header && "font-semibold")}>{p.line}</span>
                  <span className="shrink-0 text-muted">{p.header ? "section" : (p.item ?? "?")}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <Field label="Steps" hint="One step per line.">
          <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={8} className={textareaClass} />
        </Field>
        <Field label="Tags" hint="Comma separated, e.g. mexican, chicken, quick.">
          <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Notes">
          <textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} rows={3} className={textareaClass} />
        </Field>
        <Field label="Recipe link">
          <input value={v.sourceUrl ?? ""} onChange={(e) => set("sourceUrl", e.target.value || null)} inputMode="url" className={inputClass} />
        </Field>
        {!v.imageUrl?.startsWith("data:") ? (
          <Field label="Photo link">
            <input value={v.imageUrl ?? ""} onChange={(e) => set("imageUrl", e.target.value || null)} inputMode="url" className={inputClass} />
          </Field>
        ) : null}
      </Card>

      <div className="safe-bottom sticky bottom-16 z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <ErrorText>{error}</ErrorText>
        <Button variant="primary" size="lg" busy={pending} onClick={save}>
          <Icon name="check" /> Save recipe
        </Button>
      </div>
    </div>
  );
}
