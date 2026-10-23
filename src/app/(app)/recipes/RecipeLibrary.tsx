"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, startTransition } from "react";
import { setFavorite } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { Chip, cx, inputClass } from "@/components/ui";

export interface LibraryRecipe {
  id: string;
  title: string;
  imageUrl: string | null;
  tags: string[];
  mealTypes: string[];
  totalMinutes: number | null;
  isFavorite: boolean;
  isStaple: boolean;
  needsIngredients: boolean;
  lastPlannedOn: string | null;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Favorites" },
  { id: "staples", label: "Staples" },
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch", label: "Lunch" },
  { id: "dinner", label: "Dinner" },
  { id: "quick", label: "30 min or less" },
  { id: "fix", label: "Needs ingredients" },
] as const;

export function RecipeLibrary({ recipes }: { recipes: LibraryRecipe[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [favs, toggleFav] = useOptimistic(new Map(recipes.map((r) => [r.id, r.isFavorite])), (state, id: string) => {
    const next = new Map(state);
    next.set(id, !state.get(id));
    return next;
  });

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return recipes.filter((r) => {
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
        case "quick":
          return r.totalMinutes !== null && r.totalMinutes <= 30;
        case "fix":
          return r.needsIngredients;
        default:
          return true;
      }
    });
  }, [recipes, query, filter, favs]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-3 size-5 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes or tags" className={cx(inputClass, "pl-10")} />
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
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    {r.isStaple ? (
                      <span className="flex items-center gap-0.5 text-brand">
                        <Icon name="repeat" className="size-3" /> Staple
                      </span>
                    ) : null}
                    {r.totalMinutes ? <span>{r.totalMinutes} min</span> : null}
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
