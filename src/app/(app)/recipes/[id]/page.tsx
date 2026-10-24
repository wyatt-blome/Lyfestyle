import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { Icon } from "@/components/icons";
import { isSectionHeader } from "@/lib/ingredients/parse";
import { recipeImageSrc } from "@/lib/images";
import { inferMealTypes } from "@/lib/moods";
import { addDays, shortDate } from "@/lib/dates";
import { formatMinutes, recipeTime } from "@/lib/time";
import { RequestMealButton } from "@/components/RequestMeal";
import { requireViewer } from "@/server/auth";
import { currentWeekStart } from "@/server/data";
import { RecipeActions } from "./RecipeActions";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const db = await getDb();
  const [r] = await db
    .select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, viewer.household.id)))
    .limit(1);
  if (!r) notFound();
  const img = recipeImageSrc(r);
  const time = recipeTime(r);
  const thisWeek = currentWeekStart(viewer.household.settings);
  const mealTypes = r.mealTypes.length ? r.mealTypes : inferMealTypes(r);
  let host: string | null = null;
  try {
    host = r.sourceUrl ? new URL(r.sourceUrl).hostname.replace(/^www\./, "") : null;
  } catch {
    host = null;
  }

  return (
    <article className="flex flex-col gap-5 pt-2">
      <Link href="/recipes" className="flex items-center gap-1 self-start text-sm text-muted">
        <Icon name="chevronLeft" className="size-4" /> Recipes
      </Link>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" referrerPolicy="no-referrer" className="aspect-[16/10] w-full rounded-3xl object-cover" />
      ) : null}
      <header>
        <h1 className="font-display text-3xl font-semibold leading-tight">{r.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          {r.servings ? <span>Serves {r.servings}</span> : null}
          {time ? (
            <span className="flex items-center gap-1 font-medium text-ink">
              <Icon name="clock" className="size-4" /> {formatMinutes(time.total, time.estimated)}
              {time.prep && time.cook ? (
                <span className="font-normal text-muted">
                  {" "}
                  ({time.estimated ? "~" : ""}
                  {formatMinutes(time.prep)} prep, {formatMinutes(time.cook)} cook)
                </span>
              ) : null}
            </span>
          ) : null}
          <span className="capitalize">{mealTypes.join(", ")}</span>
          {r.lastPlannedOn ? <span>Last planned {shortDate(r.lastPlannedOn)}</span> : null}
        </p>
        {r.description ? <p className="mt-3 leading-relaxed">{r.description}</p> : null}
      </header>

      <RequestMealButton
        recipes={[]}
        recipe={{ id: r.id, title: r.title, imageUrl: img }}
        thisWeek={thisWeek}
        nextWeek={addDays(thisWeek, 7)}
        variant="ghost"
        className="-mb-2 self-start text-accent"
      />
      <RecipeActions id={r.id} rating={r.rating} isFavorite={r.isFavorite} isStaple={r.isStaple} stapleEveryWeeks={r.stapleEveryWeeks} mealTypes={mealTypes} />

      <section>
        <h2 className="mb-2 font-display text-xl font-semibold">Ingredients</h2>
        {r.ingredients.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {r.ingredients.map((line, i) =>
              isSectionHeader(line) ? (
                <li key={i} className="bg-surface-2 px-4 py-2 text-sm font-semibold">
                  {line}
                </li>
              ) : (
                <li key={i} className="px-4 py-2.5">
                  {line}
                </li>
              ),
            )}
          </ul>
        ) : (
          <Link href={`/recipes/${r.id}/edit`} className="block rounded-2xl border border-dashed border-warn/50 bg-warn-soft p-4 text-sm">
            No ingredients yet, so this recipe can&apos;t add anything to the grocery list. <strong>Add them</strong>
          </Link>
        )}
      </section>

      {r.steps.length ? (
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold">Steps</h2>
          <ol className="flex flex-col gap-3">
            {r.steps.map((s, i) =>
              /:$/.test(s) && s.length < 60 ? (
                <li key={i} className="pt-2 font-semibold">
                  {s}
                </li>
              ) : (
                <li key={i} className="flex gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">{i + 1}</span>
                  <p className="leading-relaxed">{s}</p>
                </li>
              ),
            )}
          </ol>
        </section>
      ) : null}

      {r.notes ? (
        <section>
          <h2 className="mb-2 font-display text-xl font-semibold">Notes</h2>
          <p className="whitespace-pre-line leading-relaxed">{r.notes}</p>
        </section>
      ) : null}

      <footer className="flex flex-wrap gap-2 text-sm">
        {r.sourceUrl ? (
          <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4">
            <Icon name="external" className="size-4" /> {host ?? "Original recipe"}
          </a>
        ) : null}
        {r.pinterestUrl ? (
          <a href={r.pinterestUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4">
            <Icon name="pin" className="size-4" /> Pinterest
          </a>
        ) : null}
        {r.tags.map((t) => (
          <span key={t} className="inline-flex h-10 items-center rounded-full bg-surface-2 px-4 text-muted">
            {t}
          </span>
        ))}
      </footer>
    </article>
  );
}
