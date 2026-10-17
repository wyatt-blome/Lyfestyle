"use client";
import Link from "next/link";
import { useState } from "react";
import { episodeById, SOURCE_LABEL, whyCards } from "@/seed";
import { cardsFor, resolveRefs } from "@/lib/why";
import type { WhyCard } from "@/lib/types";
import { Badge } from "./kit";

/** One "Why we do this" card: plan → expert refs → ⚠ unverified → Experts disagree. */
export function WhyCardView({ card, collapsible = true, defaultOpen = false }: { card: WhyCard; collapsible?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || !collapsible);
  const refs = resolveRefs(card, episodeById);
  return (
    <article className="rounded-3xl border border-line bg-surface p-4">
      <button
        type="button"
        onClick={() => collapsible && setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="flex flex-col gap-1">
          <span className="text-sm uppercase tracking-wide text-muted">Why we do this</span>
          <span className="text-lg font-semibold">{card.title}</span>
        </span>
        {collapsible && <span className="text-2xl text-muted">{open ? "−" : "+"}</span>}
      </button>
      {card.disagreement && (
        <div className="mt-2">
          <Badge tone="info">Experts disagree</Badge>
        </div>
      )}
      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p>
            <span className="text-muted">Our plan: </span>
            {card.body}
          </p>
          {card.evidence && card.evidence.length > 0 && (
            <ul className="flex flex-col gap-1 text-base">
              {card.evidence.map((e) => (
                <li key={e.url}>
                  <a href={e.url} target="_blank" rel="noreferrer" className="text-info underline">
                    {e.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <div>
            <h3 className="mb-1 text-sm uppercase tracking-wide text-muted">From the Diary of a CEO</h3>
            <ul className="flex flex-col gap-2">
              {refs.map((r) => (
                <li key={`${r.episode.id}@${r.ref.t ?? ""}`} className="text-base">
                  <span className="font-medium">{r.episode.guest}</span>{" "}
                  <span className="text-muted">({r.episode.date.slice(0, 4)})</span>
                  {r.chapterTitle ? <> · {r.chapterTitle}</> : <> · whole episode</>}
                  {r.href ? (
                    <>
                      {" "}
                      <a href={r.href} target="_blank" rel="noreferrer" className="whitespace-nowrap text-info underline">
                        {r.ref.t ? `Open at ${r.ref.t}` : "Open episode"}
                      </a>
                    </>
                  ) : (
                    <span className="text-muted"> · podcast feed only</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted">{SOURCE_LABEL}.</p>
          </div>
          {card.unverified && <p className="text-base text-warn">⚠ {card.unverified}</p>}
        </div>
      )}
    </article>
  );
}

/** Every card for the given appliesTo keys, or for explicit ids. */
export function WhyCards({ keys, ids, defaultOpen }: { keys?: string[]; ids?: string[]; defaultOpen?: boolean }) {
  const list = ids ? whyCards.filter((c) => ids.includes(c.id)) : cardsFor(whyCards, keys ?? []);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {list.map((c) => (
        <WhyCardView key={c.id} card={c} defaultOpen={defaultOpen} />
      ))}
    </div>
  );
}

export function WhyTeaser({ card }: { card: WhyCard }) {
  return (
    <Link href={`/why#${card.id}`} className="btn block rounded-3xl border border-line bg-surface p-4">
      <span className="text-sm uppercase tracking-wide text-muted">Why we do this</span>
      <span className="mt-1 block text-lg font-semibold">{card.title}</span>
      <span className="mt-1 block text-base text-muted">{card.body}</span>
    </Link>
  );
}
