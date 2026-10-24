"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteAllRecipes } from "@/actions/recipes";
import { Button, Card, ErrorText, inputClass } from "@/components/ui";

export function DeleteAllRecipes({ count }: { count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [done, setDone] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <Card className="flex flex-col gap-3 border-accent/30 p-4 text-sm">
      <h2 className="font-display text-lg font-semibold">Start over</h2>
      {done ? (
        <p className="text-brand">{done}</p>
      ) : !open ? (
        <>
          <p className="text-muted">Delete all {count} recipes, with their photos. Weekly plans stay, but their meals become empty. This can&apos;t be undone.</p>
          <Button variant="danger" onClick={() => setOpen(true)} disabled={!count}>
            Delete all recipes
          </Button>
        </>
      ) : (
        <>
          <p>
            This deletes all <strong>{count}</strong> recipes for everyone in the household. Type <strong>DELETE</strong> to confirm.
          </p>
          <input value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="characters" className={inputClass} aria-label="Type DELETE to confirm" />
          <ErrorText>{error}</ErrorText>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={pending}
              disabled={text.trim().toUpperCase() !== "DELETE"}
              onClick={() =>
                start(async () => {
                  setError(undefined);
                  const res = await deleteAllRecipes(text);
                  if (!res.ok) return setError(res.error);
                  setDone(`Deleted ${res.value.deleted} recipes.`);
                  router.refresh();
                })
              }
            >
              Delete them
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
