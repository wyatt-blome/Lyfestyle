"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { alreadyImported, countOldPhotoImports, deleteOldPhotoImports, readPhotoPage, saveRecipe } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { Button, Card, ErrorText } from "@/components/ui";
import { buildGroups, defaultBreaks, readPageText, textQuality, unreadablePart, type PageGroup, type PagePart, type RecipePart } from "@/lib/import/pages";
import { readPhotoText } from "@/lib/ocr/reader";

// A whole album at once: photos are read one after another and each recipe is saved as soon as
// it's complete, so nothing waits on a review screen and an interruption loses at most one
// recipe. Every imported photo is remembered by fingerprint, so picking the album again skips
// everything already done.

async function fingerprint(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function downscale(file: Blob, max: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

type Phase = "checking" | "ready" | "running" | "done";

export function AlbumImport({ files, reader, onCancel }: { files: File[]; reader: "device" | "claude"; onCancel: () => void }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [checked, setChecked] = useState(0);
  const [todo, setTodo] = useState<{ file: File; hash: string }[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [oldCount, setOldCount] = useState(0);
  const [clearOld, setClearOld] = useState(true);
  const [read, setRead] = useState(0);
  const [saved, setSaved] = useState(0);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string>();
  const started = useRef(false);

  // Fingerprint every photo and ask which ones are already in.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const hashed: { file: File; hash: string }[] = [];
      for (const file of files) {
        try {
          hashed.push({ file, hash: await fingerprint(file) });
        } catch {
          /* unreadable file: left out */
        }
        setChecked((n) => n + 1);
      }
      const done = new Set<string>();
      for (let i = 0; i < hashed.length; i += 500) {
        for (const h of await alreadyImported(hashed.slice(i, i + 500).map((x) => x.hash))) done.add(h);
      }
      // The same photo picked twice in one go only counts once.
      const seen = new Set<string>();
      const remaining = hashed.filter((x) => !done.has(x.hash) && !seen.has(x.hash) && seen.add(x.hash));
      setTodo(remaining);
      setSkipped(files.length - remaining.length);
      setOldCount(await countOldPhotoImports());
      setPhase("ready");
    })();
  }, [files]);

  const run = async () => {
    setPhase("running");
    setError(undefined);
    let lock: WakeLockSentinel | null = null;
    const relock = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen");
      } catch {
        lock = null;
      }
    };
    await relock();
    document.addEventListener("visibilitychange", relock);
    try {
      if (clearOld && oldCount) await deleteOldPhotoImports();

      const save = async (group: PageGroup) => {
        const pages = group.pages.map((p) => todo[p]);
        const [thumb, ...copies] = await Promise.all([downscale(pages[0].file, 480, 0.75), ...pages.map((p) => downscale(p.file, 1400, 0.7))]);
        const r = group.recipe;
        const res = await saveRecipe(
          {
            title: r.title || "Untitled recipe",
            description: r.description,
            sourceType: "photo",
            readWith: reader === "claude" ? "claude" : "phone",
            imageUrl: thumb,
            servings: r.servings,
            prepMinutes: r.prepMinutes,
            cookMinutes: r.cookMinutes,
            ingredients: r.ingredients.slice(0, 150),
            steps: r.steps.slice(0, 100),
            tags: r.tags,
            mealTypes: [],
          },
          undefined,
          copies,
          pages.map((p) => p.hash),
        );
        if (res.ok) setSaved((n) => n + 1);
        else setError(res.error);
      };

      // Parts read so far that don't yet form a finished recipe.
      let pending: PagePart[] = [];
      for (let i = 0; i < todo.length; i++) {
        let parts: RecipePart[];
        try {
          if (reader === "claude") {
            const full = await downscale(todo[i].file, 1600, 0.85);
            const res = await readPhotoPage(full.split(",")[1], "image/jpeg", todo[i].hash);
            if (!res.ok) throw new Error(res.error);
            parts = res.value;
          } else {
            const { text, confidence } = await readPhotoText(todo[i].file);
            parts = confidence < 60 || textQuality(text) < 0.6 ? [unreadablePart()] : readPageText(text);
          }
          if (!parts.length) parts = [unreadablePart()];
        } catch {
          // Not remembered as imported, so picking the album again retries it.
          setFailed((n) => n + 1);
          setRead(i + 1);
          continue;
        }
        pending = [...pending, ...parts.map((p) => ({ ...p, page: i }))];
        const groups = buildGroups(pending, defaultBreaks(pending));
        // Every group but the last is finished: a later page can't join it any more.
        for (const g of groups.slice(0, -1)) await save(g);
        const last = groups[groups.length - 1];
        pending = last.parts.map((pi) => pending[pi]);
        setRead(i + 1);
      }
      if (pending.length) {
        const [g] = buildGroups(pending, pending.map((_, i) => i === 0));
        await save(g);
      }
    } finally {
      document.removeEventListener("visibilitychange", relock);
      void (lock as WakeLockSentinel | null)?.release().catch(() => undefined);
    }
    setPhase("done");
  };

  if (phase === "checking") {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <p className="font-display text-xl font-semibold">Checking {files.length} photos…</p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-brand transition-all" style={{ width: `${(checked / files.length) * 100}%` }} />
        </div>
        <p className="text-sm text-muted">Looking for photos you&apos;ve already imported, so they&apos;re skipped.</p>
      </Card>
    );
  }

  if (phase === "ready") {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <p className="font-display text-xl font-semibold">
          {todo.length} photo{todo.length === 1 ? "" : "s"} to import
        </p>
        {skipped ? <p className="text-sm text-muted">{skipped} already imported, so they&apos;re skipped.</p> : null}
        <p className="text-sm text-muted">
          Each recipe is saved as soon as it&apos;s read. If this stops for any reason, pick the same photos again and it carries on where it left off. Keep this screen open.
        </p>
        {oldCount ? (
          <label className="flex items-start gap-3 rounded-xl bg-warn-soft p-3 text-sm">
            <input type="checkbox" checked={clearOld} onChange={(e) => setClearOld(e.target.checked)} className="mt-0.5 size-5 accent-[var(--brand)]" />
            <span>
              First delete my <strong>{oldCount}</strong> earlier photo recipes (from before this importer). They were grouped wrong, and these photos replace them.
            </span>
          </label>
        ) : null}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" className="flex-1" disabled={!todo.length} onClick={run}>
            Import {todo.length} photos
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <p className="font-display text-xl font-semibold">{phase === "done" ? "Done" : `Photo ${Math.min(read + 1, todo.length)} of ${todo.length}`}</p>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-brand transition-all" style={{ width: `${(read / Math.max(1, todo.length)) * 100}%` }} />
      </div>
      <p className="text-sm">
        <strong>{saved}</strong> recipe{saved === 1 ? "" : "s"} saved
        {failed ? ` · ${failed} photo${failed === 1 ? "" : "s"} couldn't be read (pick the album again to retry them)` : ""}
      </p>
      {phase === "running" ? <p className="text-xs text-muted">Keep this screen open. If it stops, pick the same photos again; finished ones are skipped.</p> : null}
      <ErrorText>{error}</ErrorText>
      {phase === "done" ? (
        <div className="flex flex-col gap-2">
          <Link href="/recipes/names" className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-ink">
            <Icon name="edit" /> Check the names
          </Link>
          <Link href="/recipes" className="text-center text-sm font-medium text-brand">
            See all recipes
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
