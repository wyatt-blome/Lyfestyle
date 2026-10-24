"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { splitRecipe } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { ReadAllWithClaude } from "@/components/ReadWithClaude";
import { Button, cx, ErrorText } from "@/components/ui";

export function SplitPages({ id, pages, aiEnabled }: { id: string; pages: string[]; aiEnabled: boolean }) {
  // Start with every page as its own recipe; untick pages that continue the one before.
  const [starts, setStarts] = useState<Set<number>>(() => new Set(pages.map((_, i) => i).filter((i) => i > 0)));
  const [result, setResult] = useState<string[] | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const count = starts.size + 1;

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-brand-soft p-4 text-sm">
          Split into {result.length} recipes. Each one keeps its own photos{aiEnabled ? "; let Claude read them, or name them on the Rename screen." : " and is ready to name on the Rename screen."}
        </p>
        {aiEnabled ? <ReadAllWithClaude ids={result} /> : null}
        <Link href="/recipes/names" className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-ink">
          <Icon name="edit" /> Rename recipes
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {pages.map((src, i) => (
          <li key={src} className="flex flex-col gap-2">
            {i > 0 ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={starts.has(i)}
                onClick={() =>
                  setStarts((s) => {
                    const n = new Set(s);
                    if (n.has(i)) n.delete(i);
                    else n.add(i);
                    return n;
                  })
                }
                className={cx(
                  "flex items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium",
                  starts.has(i) ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-muted",
                )}
              >
                <span className={cx("grid size-6 place-items-center rounded-md border-2", starts.has(i) ? "border-brand bg-brand text-brand-ink" : "border-line")}>
                  {starts.has(i) ? <Icon name="check" className="size-3.5" /> : null}
                </span>
                {starts.has(i) ? "A new recipe starts here" : "Same recipe as the page above"}
              </button>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Page ${i + 1}`} loading="lazy" className="max-h-80 w-full rounded-xl border border-line bg-white object-contain" />
          </li>
        ))}
      </ol>
      <ErrorText>{error}</ErrorText>
      <div className="safe-bottom sticky bottom-16 z-10 -mx-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          busy={pending}
          disabled={count < 2}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const res = await splitRecipe(id, [...starts]);
              if (!res.ok) setError(res.error);
              else setResult(res.value.ids);
            })
          }
        >
          Split into {count} recipes
        </Button>
      </div>
    </div>
  );
}
