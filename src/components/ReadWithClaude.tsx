"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readRecipeWithClaude } from "@/actions/recipes";
import { Icon } from "./icons";
import { Button, Card, ErrorText } from "./ui";

/** One recipe: read its photo with Claude (once ever). */
export function ReadWithClaudeButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          setError(undefined);
          const res = await readRecipeWithClaude(id);
          setBusy(false);
          if (!res.ok) return setError(res.error);
          setNote(res.value.changed.length ? `Updated the ${res.value.changed.join(", ")}.` : "Read it; nothing needed changing.");
          router.refresh();
        }}
      >
        <Icon name="sparkle" className="size-4" /> Read the photo with Claude
      </Button>
      {note ? <p className="text-sm text-brand">{note}</p> : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** Every photo recipe Claude hasn't read yet, one at a time. */
export function ReadAllWithClaude({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [updated, setUpdated] = useState(0);
  const [error, setError] = useState<string>();
  if (!ids.length) return null;
  const cost = Math.max(1, Math.round(ids.length * 0.03));
  return (
    <Card className="flex flex-col gap-2 p-4 text-sm">
      <p className="font-semibold">Read {ids.length} photo recipe{ids.length === 1 ? "" : "s"} with Claude</p>
      <p className="text-muted">
        Fixes names, and fills in ingredients and steps the phone couldn&apos;t read (including handwriting). Recipes you&apos;ve edited keep your changes. Each photo is read once,
        ever: about ${cost} total.
      </p>
      {running || done ? (
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-brand transition-all" style={{ width: `${(done / ids.length) * 100}%` }} />
        </div>
      ) : null}
      {done ? (
        <p className="text-brand">
          {done} of {ids.length} read, {updated} updated.
        </p>
      ) : null}
      <ErrorText>{error}</ErrorText>
      {done < ids.length ? (
        <Button
          variant="primary"
          busy={running}
          onClick={async () => {
            setRunning(true);
            setError(undefined);
            for (let i = done; i < ids.length; i++) {
              const res = await readRecipeWithClaude(ids[i]);
              if (!res.ok) {
                setError(res.error);
                break;
              }
              if (res.value.changed.length) setUpdated((n) => n + 1);
              setDone(i + 1);
            }
            setRunning(false);
            router.refresh();
          }}
        >
          <Icon name="sparkle" className="size-4" /> {done ? "Continue" : "Read them"}
        </Button>
      ) : null}
    </Card>
  );
}
