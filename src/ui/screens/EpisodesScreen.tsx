"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "@/db/db";
import { create, update } from "@/db/records";
import { deepLink } from "@/lib/why";
import type { Episode, EpisodeNote } from "@/lib/types";
import { DOAC_RSS, episodes, SOURCE_LABEL } from "@/seed";
import { Badge, Button, Card, Page } from "../kit";

export function EpisodesScreen() {
  const notes = useLiveQuery(async () => {
    const rows = await db().episodeNotes.toArray();
    return new Map(rows.filter((r) => !r.deletedAt).map((r) => [r.episodeId, r]));
  }, []);
  const sorted = [...episodes].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Page title="Episodes" back="/why">
      <p className="text-muted">
        {SOURCE_LABEL}. Links open the official Diary of a CEO YouTube channel; feed-only episodes are in the{" "}
        <a href={DOAC_RSS} className="text-info underline" target="_blank" rel="noreferrer">
          official podcast feed
        </a>
        .
      </p>
      {sorted.map((e) => (
        <EpisodeCard key={e.id} episode={e} note={notes?.get(e.id)} />
      ))}
    </Page>
  );
}

function EpisodeCard({ episode: e, note }: { episode: Episode; note?: EpisodeNote }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note?.myTake ?? "");
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-semibold">{e.guest}</p>
            <p className="text-sm text-muted">{e.date}</p>
          </div>
          {e.verified && <Badge tone="good">Verified</Badge>}
        </div>
        <p className="text-base">{e.title}</p>
        <p className="text-base text-muted">{e.summary}</p>
        {e.chapters.length > 0 && (
          <ul className="flex flex-col gap-1 text-base">
            {e.chapters.map((c) => {
              const href = deepLink(e, c.t);
              return (
                <li key={c.t}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="text-info underline">
                      <span className="tabular">{c.t}</span> {c.title}
                    </a>
                  ) : (
                    <span>
                      <span className="tabular">{c.t}</span> {c.title}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {e.url ? (
          <a href={e.url} target="_blank" rel="noreferrer" className="text-info underline">
            Open episode
          </a>
        ) : (
          <p className="text-sm text-muted">Podcast feed only (no video link in the seed).</p>
        )}
        <div className="mt-1 rounded-2xl bg-surface-2 p-3">
          <p className="text-sm uppercase tracking-wide text-muted">My take</p>
          {editing ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea rows={3} value={text} onChange={(ev) => setText(ev.target.value)} />
              <Button
                variant="primary"
                onClick={async () => {
                  if (note) await update(db().episodeNotes, note.id, { myTake: text });
                  else await create(db().episodeNotes, { episodeId: e.id, myTake: text });
                  setEditing(false);
                }}
              >
                Save
              </Button>
            </div>
          ) : (
            <button type="button" className="mt-1 w-full text-left text-base" onClick={() => setEditing(true)}>
              {note?.myTake || <span className="text-muted">Tap to add a note</span>}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
