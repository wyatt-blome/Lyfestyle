"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { renameRecipes } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { Button, Card, ErrorText, inputClass } from "@/components/ui";

interface Row {
  id: string;
  current: string;
  suggestion: string | null;
  imageUrl: string | null;
  firstIngredients: string[];
}

export function NameRecipes({ recipes }: { recipes: Row[] }) {
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(recipes.map((r) => [r.id, r.suggestion ?? ""])));
  const [zoom, setZoom] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const ready = recipes.filter((r) => names[r.id]?.trim());

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {recipes.map((r) => (
          <li key={r.id}>
            <Card className="flex gap-3 p-3">
              {r.imageUrl ? (
                <button type="button" onClick={() => setZoom(zoom === r.id ? null : r.id)} className="shrink-0" aria-label="Show the photo larger">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.imageUrl} alt="" referrerPolicy="no-referrer" className={zoom === r.id ? "w-40 rounded-lg object-contain" : "size-20 rounded-lg object-cover"} />
                </button>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <p className="truncate text-xs text-muted">Now: {r.current}</p>
                <input
                  value={names[r.id] ?? ""}
                  onChange={(e) => setNames((n) => ({ ...n, [r.id]: e.target.value }))}
                  placeholder="Name of the dish"
                  aria-label={`New name for ${r.current}`}
                  className={inputClass}
                />
                {r.firstIngredients.length ? <p className="line-clamp-2 text-xs text-muted">{r.firstIngredients.join(" · ")}</p> : null}
                <Link href={`/recipes/${r.id}/edit`} className="text-xs font-medium text-brand">
                  Open the recipe to fix ingredients
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
      <div className="safe-bottom sticky bottom-16 z-10 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          busy={pending}
          disabled={!ready.length}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const res = await renameRecipes(ready.map((r) => ({ id: r.id, title: names[r.id].trim() })));
              if (!res.ok) setError(res.error);
              else router.refresh();
            })
          }
        >
          <Icon name="check" /> Save {ready.length} name{ready.length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
