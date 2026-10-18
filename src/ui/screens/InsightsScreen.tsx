"use client";
// The user's own insights: a principle (≤ 280 chars) with a source link, optionally tied to a
// seeded episode. Always labeled "Your note" and kept apart from the seeded expert content.
import { useState } from "react";
import { addInsight, deleteInsight, editInsight, PRINCIPLE_MAX, useUserInsights, validateInsight, type InsightInput } from "@/client/insights";
import type { ExpertInsight } from "@/lib/types";
import { episodeById, episodes } from "@/seed";
import { Badge, Button, Card, Field, Page } from "../kit";
import { useToast } from "../Toast";

const EMPTY: InsightInput = { principle: "", url: "", episodeId: "", myTake: "" };

export function InsightsScreen() {
  const insights = useUserInsights();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Page title="My insights" back="/why">
      <p className="text-muted">
        Principles you picked up, in your words, with the link you got them from. These are your notes, not part of the app&apos;s
        expert summaries.
      </p>
      <Card title="Add an insight">
        <InsightForm key="new" initial={EMPTY} submitLabel="Save insight" onSubmit={addInsight} />
      </Card>
      {insights && insights.length === 0 && <p className="text-muted">No insights yet.</p>}
      {insights?.map((i) =>
        editing === i.id ? (
          <Card key={i.id} title="Edit insight">
            <InsightForm
              initial={{ principle: i.principle, url: i.url, episodeId: i.episodeId ?? "", myTake: i.myTake ?? "" }}
              submitLabel="Save changes"
              onSubmit={async (v) => {
                await editInsight(i.id, v);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          </Card>
        ) : (
          <InsightCard key={i.id} insight={i} onEdit={() => setEditing(i.id)} />
        ),
      )}
    </Page>
  );
}

function InsightCard({ insight: i, onEdit }: { insight: ExpertInsight; onEdit: () => void }) {
  const ep = i.episodeId ? episodeById.get(i.episodeId) : undefined;
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <div>
          <Badge tone="info">Your note</Badge>
        </div>
        <p className="text-lg">{i.principle}</p>
        {ep && (
          <p className="text-base text-muted">
            Linked episode: {ep.guest} ({ep.date.slice(0, 4)}) · {ep.title}
          </p>
        )}
        <a
          href={i.url}
          target="_blank"
          rel="noreferrer noopener"
          className="btn inline-flex min-h-12 items-center self-start break-all text-base text-info underline"
        >
          {i.url}
        </a>
        {i.myTake && (
          <div className="rounded-2xl bg-surface-2 p-3">
            <p className="text-sm uppercase tracking-wide text-muted">My take</p>
            <p className="mt-1">{i.myTake}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={onEdit}>Edit</Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (confirm("Delete this insight?")) await deleteInsight(i.id);
            }}
          >
            Delete
          </Button>
        </div>
      </div>
    </Card>
  );
}

function InsightForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: InsightInput;
  submitLabel: string;
  onSubmit: (v: InsightInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState<InsightInput>(initial);
  const [busy, setBusy] = useState(false);
  const count = v.principle.trim().length;
  const left = PRINCIPLE_MAX - count;
  const error = validateInsight(v);
  const sorted = [...episodes].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (error) return toast(error, "bad");
        setBusy(true);
        try {
          await onSubmit(v);
          setV(initial);
          toast("Saved", "good");
        } catch (err) {
          toast((err as Error).message, "bad");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Principle">
        <textarea
          rows={3}
          value={v.principle}
          maxLength={PRINCIPLE_MAX + 20}
          onChange={(e) => setV({ ...v, principle: e.target.value })}
          aria-describedby="principle-count"
        />
      </Field>
      <p id="principle-count" className={`-mt-2 text-right text-sm tabular ${left < 0 ? "text-bad" : left <= 20 ? "text-warn" : "text-muted"}`} aria-live="polite">
        {left < 0 ? `${-left} over the ${PRINCIPLE_MAX} limit` : `${left} left`}
      </p>
      <Field label="Episode (optional)">
        <select
          value={v.episodeId ?? ""}
          onChange={(e) => {
            const ep = episodeById.get(e.target.value);
            // Fill the link from the episode when it's still empty.
            setV({ ...v, episodeId: e.target.value, url: v.url.trim() === "" && ep?.url ? ep.url : v.url });
          }}
        >
          <option value="">None</option>
          {sorted.map((ep) => (
            <option key={ep.id} value={ep.id}>
              {ep.guest} ({ep.date.slice(0, 4)})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Source link" hint="Required, starts with https://">
        <input type="url" inputMode="url" autoComplete="off" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" />
      </Field>
      <Field label="My take (optional)">
        <textarea rows={2} value={v.myTake ?? ""} onChange={(e) => setV({ ...v, myTake: e.target.value })} />
      </Field>
      <div className={`grid gap-3 ${onCancel ? "grid-cols-2" : "grid-cols-1"}`}>
        <Button type="submit" variant="primary" disabled={busy || !!error}>
          {submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
