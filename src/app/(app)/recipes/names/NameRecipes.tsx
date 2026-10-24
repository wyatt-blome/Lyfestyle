"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { renameRecipes } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { Button, Card, cx, ErrorText, inputClass } from "@/components/ui";

interface Row {
  id: string;
  current: string;
  /** the name looks broken */
  flagged: boolean;
  suggestion: string | null;
  imageUrl: string | null;
  firstIngredients: string[];
}

export function NameRecipes({ recipes }: { recipes: Row[] }) {
  const router = useRouter();
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(recipes.map((r) => [r.id, r.flagged ? (r.suggestion ?? "") : r.current])),
  );
  const [zoom, setZoom] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [savedNote, setSavedNote] = useState<string>();
  const [pending, start] = useTransition();
  const changed = recipes.filter((r) => names[r.id]?.trim() && names[r.id].trim() !== r.current);
  const flagged = recipes.filter((r) => r.flagged);
  const others = recipes.filter((r) => !r.flagged);

  const row = (r: Row) => (
    <li key={r.id}>
      <Card className="flex gap-3 p-3">
        {r.imageUrl ? (
          <button type="button" onClick={() => setZoom(zoom === r.id ? null : r.id)} className="shrink-0" aria-label={zoom === r.id ? "Make the photo smaller" : "Show the photo larger"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className={zoom === r.id ? "w-56 rounded-lg bg-white object-contain" : "h-24 w-20 rounded-lg bg-white object-cover object-top"}
            />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {r.flagged ? <p className="truncate text-xs text-muted">Now: {r.current}</p> : null}
          <input
            value={names[r.id] ?? ""}
            onChange={(e) => setNames((n) => ({ ...n, [r.id]: e.target.value }))}
            onFocus={(e) => r.flagged && e.target.select()}
            placeholder="Name of the dish"
            aria-label={`Name for ${r.current}`}
            className={cx(inputClass, names[r.id]?.trim() && names[r.id].trim() !== r.current && "border-brand")}
          />
          {r.firstIngredients.length ? <p className="line-clamp-2 text-xs text-muted">{r.firstIngredients.join(" · ")}</p> : null}
          <Link href={`/recipes/${r.id}/edit`} className="text-xs font-medium text-brand">
            Fix ingredients or steps
          </Link>
        </div>
      </Card>
    </li>
  );

  return (
    <div className="flex flex-col gap-3">
      {flagged.length ? (
        <>
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Need a name ({flagged.length})</h2>
          <ul className="flex flex-col gap-3">{flagged.map(row)}</ul>
        </>
      ) : null}
      {others.length ? (
        <>
          <h2 className="mt-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Check these too ({others.length})</h2>
          <p className="-mt-2 px-1 text-xs text-muted">Read from photos or pasted text. Change any that are wrong.</p>
          <ul className="flex flex-col gap-3">{others.map(row)}</ul>
        </>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <div className="safe-bottom sticky bottom-16 z-10 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        {savedNote ? <p className="mb-2 text-center text-sm text-brand">{savedNote}</p> : null}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          busy={pending}
          disabled={!changed.length}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const res = await renameRecipes(changed.map((r) => ({ id: r.id, title: names[r.id].trim() })));
              if (!res.ok) return setError(res.error);
              setSavedNote(`Saved ${res.value.renamed} name${res.value.renamed === 1 ? "" : "s"}.`);
              router.refresh();
            })
          }
        >
          <Icon name="check" /> {changed.length ? `Save ${changed.length} name${changed.length === 1 ? "" : "s"}` : "Type a new name to save"}
        </Button>
      </div>
    </div>
  );
}
