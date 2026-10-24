"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { readPhotoPage, saveRecipe } from "@/actions/recipes";
import { Icon } from "@/components/icons";
import { RecipeEditor, type EditorValue } from "@/components/RecipeEditor";
import { Button, Card, cx, ErrorText, inputClass } from "@/components/ui";
import { looksLikeBadTitle } from "@/lib/import/title";
import { buildGroups, defaultBreaks, readPageText, textQuality, unreadablePart, type PageGroup, type PagePart, type RecipePart } from "@/lib/import/pages";
import type { ImportedRecipe } from "@/lib/import/types";
import { readPhotoText } from "@/lib/ocr/reader";

interface Photo {
  id: string;
  file: File;
  thumb: string;
  status: "waiting" | "reading" | "done" | "error";
  progress: number;
  parts: RecipePart[];
  error?: string;
}

type Reader = "device" | "claude";

/** Photos per batch: more than this and phone browsers can run out of memory partway. */
const MAX_BATCH = 40;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** sha256 of the photo file, so the same photo is never read twice. */
async function fingerprint(file: Blob): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
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

function toEditor(r: ImportedRecipe, imageUrl: string | null, readWith: "phone" | "claude" = "phone"): EditorValue {
  return {
    title: r.title,
    description: r.description,
    sourceUrl: null,
    pinterestUrl: null,
    sourceType: "photo",
    readWith,
    imageUrl,
    servings: r.servings,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    totalMinutes: r.totalMinutes,
    ingredients: r.ingredients,
    steps: r.steps,
    tags: r.tags,
    mealTypes: [],
    notes: null,
    isFavorite: false,
    rating: null,
    isStaple: false,
    stapleEveryWeeks: null,
  };
}

export function PhotoImport({ aiEnabled, onUseText }: { aiEnabled: boolean; onUseText: () => void }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [reader, setReader] = useState<Reader>(aiEnabled ? "claude" : "device");
  const [stage, setStage] = useState<"pick" | "reading" | "review">("pick");
  const [breaks, setBreaks] = useState<boolean[]>([]);
  const [saved, setSaved] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [savingAll, setSavingAll] = useState(false);
  // Names typed on the review screen, by group.
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [editingPages, setEditingPages] = useState<string[]>([]);
  // Which reader read the photos that are being reviewed.
  const [readBy, setReadBy] = useState<"phone" | "claude">("phone");

  const update = (id: string, patch: Partial<Photo>) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // Readable copies of a recipe's pages, made only when saving so big batches don't fill memory.
  const pageCopies = (group: PageGroup) => Promise.all(group.pages.map((pg) => downscale(photos[pg].file, 1400, 0.7)));

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(undefined);
    if (photos.length + files.length > MAX_BATCH) {
      setError(`Add up to ${MAX_BATCH} photos at a time. Phones run out of memory on bigger batches; save these, then add the next ones.`);
      return;
    }
    const added: Photo[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push({
          id: crypto.randomUUID(),
          file,
          thumb: await downscale(file, 480, 0.75),
          status: "waiting",
          progress: 0,
          parts: [],
        });
      } catch {
        setError("One of those files couldn't be opened. Use JPEG or PNG photos.");
      }
    }
    setPhotos((ps) => [...ps, ...added]);
  };

  const move = (i: number, d: -1 | 1) =>
    setPhotos((ps) => {
      const next = [...ps];
      const j = i + d;
      if (j < 0 || j >= next.length) return ps;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const readOne = async (p: Photo, how: Reader): Promise<RecipePart[]> => {
    if (how === "claude") {
      const full = await downscale(p.file, 1600, 0.85);
      const res = await readPhotoPage(full.split(",")[1], "image/jpeg", await fingerprint(p.file));
      if (!res.ok) throw new Error(res.error);
      return res.value;
    }
    const { text, confidence } = await readPhotoText(p.file, (progress) => update(p.id, { progress }));
    // Handwriting comes back as noise; keep those pages as photos rather than saving gibberish.
    if (confidence < 60 || textQuality(text) < 0.6) return [unreadablePart()];
    return readPageText(text);
  };

  const readAll = async () => {
    setStage("reading");
    // Keep the phone awake: a sleeping screen pauses the reading.
    let lock: WakeLockSentinel | null = null;
    try {
      lock = "wakeLock" in navigator ? await navigator.wakeLock.request("screen") : null;
    } catch {
      lock = null;
    }
    setReadBy(reader === "claude" ? "claude" : "phone");
    setError(undefined);
    const queue = photos.filter((p) => p.status !== "done");
    // The phone reads one photo at a time; Claude can take a few at once.
    const lanes = reader === "claude" ? 3 : 1;
    const results = new Map(photos.map((p) => [p.id, p.parts]));
    let next = 0;
    await Promise.all(
      Array.from({ length: lanes }, async () => {
        while (next < queue.length) {
          const p = queue[next++];
          update(p.id, { status: "reading", progress: 0, error: undefined });
          try {
            const parts = await readOne(p, reader);
            results.set(p.id, parts);
            update(p.id, { status: "done", parts, progress: 1 });
          } catch (e) {
            update(p.id, { status: "error", error: e instanceof Error ? e.message : "Couldn't read this photo." });
          }
        }
      }),
    );
    const flat: PagePart[] = photos.flatMap((p, page) => (results.get(p.id) ?? []).map((part) => ({ ...part, page })));
    setBreaks(defaultBreaks(flat));
    setSaved({});
    setTitles({});
    setStage("review");
    void lock?.release().catch(() => undefined);
  };

  const parts: PagePart[] = useMemo(() => photos.flatMap((p, page) => p.parts.map((part) => ({ ...part, page }))), [photos]);
  const groups: PageGroup[] = useMemo(() => (parts.length === breaks.length ? buildGroups(parts, breaks) : []), [parts, breaks]);

  // Regrouping is only offered before anything is saved, so saved recipes never get saved twice.
  const anySaved = Object.keys(saved).length > 0;
  const toggleBreak = (partIndex: number, value: boolean) => {
    setBreaks((b) => b.map((x, i) => (i === partIndex ? value : x)));
    setTitles({});
  };

  const saveAll = async () => {
    setSavingAll(true);
    setError(undefined);
    for (let g = 0; g < groups.length; g++) {
      if (saved[g]) continue;
      const group = groups[g];
      const res = await saveRecipe(
        { ...toEditor({ ...group.recipe, title: titles[g]?.trim() || group.recipe.title || "Untitled recipe" }, photos[group.pages[0]]?.thumb ?? null, readBy), mealTypes: [] },
        undefined,
        await pageCopies(group),
      );
      if (res.ok) setSaved((s) => ({ ...s, [g]: res.value.id }));
      else setError(`“${group.recipe.title}”: ${res.error}`);
    }
    setSavingAll(false);
  };

  if (editing !== null && groups[editing]) {
    const group = groups[editing];
    return (
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setEditing(null)} className="flex items-center gap-1 self-start text-sm text-muted">
          <Icon name="chevronLeft" className="size-4" /> Back to all photos
        </button>
        <div className="flex gap-2 overflow-x-auto">
          {group.pages.map((pg) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={pg} src={photos[pg].thumb} alt={`Photo ${pg + 1}`} className="h-28 rounded-lg border border-line object-cover" />
          ))}
        </div>
        <RecipeEditor
          initial={toEditor({ ...group.recipe, title: titles[editing]?.trim() || group.recipe.title }, photos[group.pages[0]]?.thumb ?? null, readBy)}
          photos={editingPages}
          notice="Read from your photos. Check the amounts before saving."
          onSaved={(id) => {
            setSaved((s) => ({ ...s, [editing]: id }));
            setEditing(null);
          }}
        />
      </div>
    );
  }

  const readerChoice = aiEnabled ? (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to read the photos">
      {(
        [
          ["claude", "Claude", "Best for handwriting"],
          ["device", "On this phone", "Free; printed recipes"],
        ] as const
      ).map(([id, label, hint]) => (
        <button
          key={id}
          role="radio"
          aria-checked={reader === id}
          onClick={() => setReader(id)}
          className={cx("flex flex-col items-start rounded-2xl border px-3 py-2 text-left text-sm", reader === id ? "border-brand bg-brand-soft" : "border-line bg-surface")}
        >
          <span className="font-semibold">{label}</span>
          <span className="text-xs text-muted">{hint}</span>
        </button>
      ))}
    </div>
  ) : (
    <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
      Photos are read on this phone, free. Printed recipes read well; for handwritten cards, check the text carefully or use{" "}
      <button type="button" onClick={onUseText} className="font-medium text-brand underline underline-offset-2">
        Paste text
      </button>{" "}
      with your phone&apos;s Live Text.
    </p>
  );

  if (stage === "review") {
    const unread = photos.filter((p) => p.status === "error" || (p.status === "done" && !p.parts.length));
    const allSaved = groups.length > 0 && groups.every((_, g) => saved[g]);
    return (
      <div className="flex flex-col gap-4">
        <Card className="p-4">
          <p className="font-display text-xl font-semibold">
            Found {groups.length} recipe{groups.length === 1 ? "" : "s"} in {photos.length} photo{photos.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-sm text-muted">Pages that go together are grouped. If a group is wrong, join it to the recipe above or split it.</p>
        </Card>
        {unread.length ? (
          <p className="rounded-xl bg-warn-soft px-3 py-2 text-sm">
            {unread.map((p) => `Photo ${photos.indexOf(p) + 1}`).join(", ")}: {unread[0].error ?? "no recipe text found"}.
          </p>
        ) : null}
        <ErrorText>{error}</ErrorText>
        <ul className="flex flex-col gap-3">
          {groups.map((group, g) => (
            <li key={g}>
              <Card className="overflow-hidden">
                <div className="flex gap-3 p-3">
                  <div className="flex shrink-0 -space-x-6">
                    {group.pages.map((pg) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={pg} src={photos[pg].thumb} alt={`Photo ${pg + 1}`} className="h-20 w-16 rounded-lg border-2 border-surface object-cover shadow-sm" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    {saved[g] ? (
                      <p className="line-clamp-2 font-medium leading-snug">{titles[g] ?? group.recipe.title}</p>
                    ) : (
                      <input
                        value={titles[g] ?? group.recipe.title}
                        onChange={(e) => setTitles((t) => ({ ...t, [g]: e.target.value }))}
                        onFocus={(e) => looksLikeBadTitle(e.target.value) && e.target.select()}
                        aria-label="Recipe name"
                        placeholder="Name of the dish"
                        className={cx(inputClass, "h-9 font-medium", looksLikeBadTitle(titles[g] ?? group.recipe.title) && "border-warn")}
                      />
                    )}
                    <p className="text-xs text-muted">
                      {group.pages.length > 1 ? `Photos ${group.pages.map((p) => p + 1).join(" + ")}` : `Photo ${group.pages[0] + 1}`} · {group.unreadable ? "photo only" : `${plural(group.recipe.ingredients.length, "ingredient")} · ${plural(group.recipe.steps.length, "step")}`}
                    </p>
                    {group.unreadable ? (
                      <p className="text-xs text-warn">
                        Looks handwritten, so it wasn&apos;t read. It&apos;s saved as a photo recipe: type the name now, and the ingredients later while looking at the photo.
                      </p>
                    ) : !group.recipe.ingredients.length ? (
                      <p className="text-xs text-warn">No ingredients found; add them when you review.</p>
                    ) : null}
                    {saved[g] ? (
                      <Link href={`/recipes/${saved[g]}`} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-brand">
                        <Icon name="check" className="size-4" /> Saved
                      </Link>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1.5">
                  {!saved[g] ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-brand"
                      onClick={async () => {
                        setEditingPages(await pageCopies(group));
                        setEditing(g);
                      }}
                    >
                      <Icon name="edit" className="size-4" /> Review & save
                    </Button>
                  ) : null}
                  {g > 0 && !anySaved ? (
                    <Button size="sm" variant="ghost" onClick={() => toggleBreak(group.parts[0], false)}>
                      Same recipe as above
                    </Button>
                  ) : null}
                  {(anySaved ? [] : group.parts.slice(1)).map((pi) => (
                    <Button key={pi} size="sm" variant="ghost" onClick={() => toggleBreak(pi, true)}>
                      Split at photo {parts[pi].page + 1}
                    </Button>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
        {allSaved ? (
          <Link href="/recipes" className="flex h-12 items-center justify-center rounded-full bg-brand font-medium text-brand-ink">
            Done, see my recipes
          </Link>
        ) : (
          <Button variant="primary" size="lg" busy={savingAll} onClick={saveAll} disabled={!groups.length}>
            <Icon name="check" /> Save all {groups.filter((_, g) => !saved[g]).length} as they are
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setPhotos([]);
            setBreaks([]);
            setSaved({});
            setStage("pick");
          }}
        >
          Start over with new photos
        </Button>
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-display text-xl font-semibold">Photos of recipe cards or cookbook pages</h2>
        <p className="mt-1 text-sm text-muted">
          Add up to 40 at a time, in page order. Each photo becomes its own recipe unless a page clearly continues the one before; you can join or split them before saving.
        </p>
      </div>
      {readerChoice}
      {photos.length ? (
        <ol className="flex flex-col gap-2">
          {photos.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">Photo {i + 1}</p>
                {p.status === "reading" ? (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-brand transition-all" style={{ width: `${Math.max(8, p.progress * 100)}%` }} />
                  </div>
                ) : p.status === "error" ? (
                  <p className="text-xs text-accent">{p.error}</p>
                ) : p.status === "done" ? (
                  <p className="text-xs text-brand">Read</p>
                ) : null}
              </div>
              {stage === "pick" ? (
                <div className="flex shrink-0 items-center">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-full disabled:opacity-30">
                    <Icon name="chevronLeft" className="size-4 rotate-90" />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === photos.length - 1} onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-full disabled:opacity-30">
                    <Icon name="chevronRight" className="size-4 rotate-90" />
                  </button>
                  <button type="button" aria-label="Remove photo" onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))} className="grid size-9 place-items-center rounded-full text-muted">
                    <Icon name="x" className="size-4" />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <ErrorText>{error}</ErrorText>
      {stage === "pick" ? (
        <>
          <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-line bg-surface font-medium">
            <Icon name="camera" /> {photos.length ? "Add more photos" : "Take or choose photos"}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {photos.length ? (
            <Button variant="primary" size="lg" onClick={readAll}>
              Read {photos.length} photo{photos.length === 1 ? "" : "s"}
            </Button>
          ) : null}
          {reader === "device" ? <p className="text-xs text-muted">The first time, the phone downloads the reader (about 6 MB).</p> : null}
        </>
      ) : (
        <p className="text-center text-sm text-muted">Reading… keep this screen open.</p>
      )}
    </Card>
  );
}
