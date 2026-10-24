"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, startTransition } from "react";
import { setFavorite } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { StarsShown } from "@/components/Stars";
import { Chip, cx, inputClass } from "@/components/ui";
import { formatMinutes } from "@/lib/time";

export interface LibraryRecipe {
  id: string;
  title: string;
  imageUrl: string | null;
  tags: string[];
  mealTypes: string[];
  /** total time, given or estimated */
  minutes: number | null;
  minutesEstimated: boolean;
  rating: number | null;
  createdAt: string;
  isFavorite: boolean;
  isStaple: boolean;
  needsIngredients: boolean;
  lastPlannedOn: string | null;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favorites" },
  { id: "staples", label: "Staples" },
  { id: "top", label: "4★ and up" },
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "quick", label: "30 min or less" },
  { id: "fix", label: "Needs ingredients" },
] as const;

const SORTS = [
  { id: "rating", label: "Top rated" },
  { id: "quick", label: "Quickest" },
  { id: "name", label: "A to Z" },
  { id: "new", label: "Newest" },
  { id: "stale", label: "Not made lately" },
] as const;
type Sort = (typeof SORTS)[number]["id"];

function sortRecipes(list: LibraryRecipe[], sort: Sort): LibraryRecipe[] {
  const byName = (a: LibraryRecipe, b: LibraryRecipe) => a.title.localeCompare(b.title);
  const sorted = [...list];
  switch (sort) {
    case "rating":
      // Unrated recipes go after rated ones.
      return sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byName(a, b));
    case "quick":
      return sorted.sort((a, b) => (a.minutes ?? Infinity) - (b.minutes ?? Infinity) || byName(a, b));
    case "new":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "stale":
      // Never planned first, then the longest since they were last on a plan.
      return sorted.sort((a, b) => (a.lastPlannedOn ?? "").localeCompare(b.lastPlannedOn ?? "") || byName(a, b));
    default:
      return sorted.sort(byName);
  }
}

export function RecipeLibrary({ recipes }: { recipes: LibraryRecipe[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [favs, toggleFav] = useOptimistic(new Map(recipes.map((r) => [r.id, r.isFavorite])), (state, id: string) => {
    const next = new Map(state);
    next.set(id, !state.get(id));
    return next;
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = recipes.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !r.tags.some((t) => t.includes(q))) return false;
      switch (filter) {
        case "favorites":
          return favs.get(r.id);
        case "staples":
          return r.isStaple;
        case "breakfast":
        case "lunch":
        case "dinner":
          return r.mealTypes.includes(filter);
        case "top":
          return (r.rating ?? 0) >= 4;
        case "quick":
          return r.minutes !== null && r.minutes <= 30;
        case "fix":
          return r.needsIngredients;
        default:
          return true;
      }
    });
    return sortRecipes(matches, sort);
  }, [recipes, query, filter, favs, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-3 size-5 text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes or tags" className={cx(inputClass, "pl-10")} />
        </div>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={cx(inputClass, "w-auto shrink-0 pr-8")}>
          {SORTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTERS.filter((f) => f.id !== "fix" || recipes.some((r) => r.needsIngredients)).map((f) => (
          <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)} className="shrink-0">
            {f.label}
          </Chip>
        ))}
      </div>
      {shown.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {shown.map((r) => (
            <li key={r.id} className="relative">
              <Link href={`/recipes/${r.id}`} className="block overflow-hidden rounded-2xl border border-line bg-surface">
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[4/3] w-full place-items-center bg-brand-soft text-brand">
                    <Icon name="leaf" className="size-8" />
                  </div>
                )}
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">{r.title}</p>
                  {r.rating ? <StarsShown rating={r.rating} /> : null}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {r.isStaple ? (
                      <span className="flex items-center gap-0.5 text-brand">
                        <Icon name="repeat" className="size-3" /> Staple
                      </span>
                    ) : null}
                    {r.minutes ? (
                      <span title={r.minutesEstimated ? "Estimated from the steps" : undefined}>
                        {r.minutesEstimated ? "~" : ""}
                        {formatMinutes(r.minutes)}
                      </span>
                    ) : null}
                    {r.needsIngredients ? <span className="text-warn">Needs ingredients</span> : null}
                  </p>
                </div>
              </Link>
              <button
                type="button"
                aria-label={favs.get(r.id) ? "Remove from favorites" : "Add to favorites"}
                aria-pressed={favs.get(r.id)}
                onClick={() =>
                  startTransition(async () => {
                    toggleFav(r.id);
                    await setFavorite(r.id, !favs.get(r.id));
                  })
                }
                className="absolute right-2 top-2 grid size-9 place-items-center rounded-full bg-surface/90 shadow-sm backdrop-blur"
              >
                <Icon name="heart" filled={favs.get(r.id)} className={cx("size-5", favs.get(r.id) ? "text-accent" : "text-muted")} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-10 text-center text-sm text-muted">No recipes match.</p>
      )}
    </div>
  );
}
