"use client";

import Link from "next/link";
import { startTransition, useMemo, useOptimistic, useState } from "react";
import { setFavorite } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { StarsShown } from "@/components/Stars";
import { cx, inputClass } from "@/components/ui";
import { CATEGORIES } from "@/lib/categories";
import { formatMinutes } from "@/lib/time";

export interface LibraryRecipe {
  id: string;
  title: string;
  tags: string[];
  /** total time, given or estimated */
  minutes: number | null;
  minutesEstimated: boolean;
  rating: number | null;
  createdAt: string;
  isFavorite: boolean;
  isStaple: boolean;
  lastPlannedOn: string | null;
  /** category ids from lib/categories */
  categories: string[];
}

const SORTS = [
  { id: "name", label: "A to Z" },
  { id: "rating", label: "Top rated" },
  { id: "quick", label: "Quickest" },
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

const GROUPS = [...new Set(CATEGORIES.map((c) => c.group))];

export function RecipeLibrary({ recipes }: { recipes: LibraryRecipe[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<Sort>("name");
  const [favs, toggleFav] = useOptimistic(new Map(recipes.map((r) => [r.id, r.isFavorite])), (state, id: string) => {
    const next = new Map(state);
    next.set(id, !state.get(id));
    return next;
  });

  // How many recipes are in each category, so empty ones can be left out of the menu.
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of recipes) for (const id of r.categories) c.set(id, (c.get(id) ?? 0) + 1);
    return c;
  }, [recipes]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = recipes.filter((r) => {
      if (q && !r.title.toLowerCase().includes(q) && !r.tags.some((t) => t.includes(q))) return false;
      if (category === "favorites") return favs.get(r.id);
      if (category !== "all") return r.categories.includes(category);
      return true;
    });
    return sortRecipes(matches, sort);
  }, [recipes, query, category, favs, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-3 size-5 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes" className={cx(inputClass, "pl-10")} />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
          <option value="all">All recipes ({recipes.length})</option>
          {GROUPS.map((g) => (
            <optgroup key={g} label={g}>
              {CATEGORIES.filter((c) => c.group === g && (counts.get(c.id) || c.id === "favorites")).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.id === "favorites" ? [...favs.values()].filter(Boolean).length : counts.get(c.id)})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={cx(inputClass, "w-auto pr-8")}>
          {SORTS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {shown.length ? (
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {shown.map((r) => (
            <li key={r.id} className="flex items-center">
              <Link href={`/recipes/${r.id}`} className="min-w-0 flex-1 px-4 py-3">
                <p className="font-medium leading-snug">{r.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
                  {r.rating ? <StarsShown rating={r.rating} /> : null}
                  {r.minutes ? (
                    <span title={r.minutesEstimated ? "Estimated from the steps" : undefined}>
                      {r.minutesEstimated ? "~" : ""}
                      {formatMinutes(r.minutes)}
                    </span>
                  ) : null}
                  {r.isStaple ? (
                    <span className="flex items-center gap-0.5 text-brand">
                      <Icon name="repeat" className="size-3" /> Staple
                    </span>
                  ) : null}
                  {r.categories.includes("fix-ingredients") ? <span className="text-warn">Needs ingredients</span> : null}
                  {r.categories.includes("fix-name") ? <span className="text-warn">Needs a name</span> : null}
                </p>
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
                className="grid size-12 shrink-0 place-items-center"
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
