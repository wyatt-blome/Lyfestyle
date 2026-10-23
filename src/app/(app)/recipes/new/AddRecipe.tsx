"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { boardPins, importAndSave, importLink, importPhoto } from "@/actions/recipes";
import { Icon, type IconName } from "@/components/icons";
import { RecipeEditor, type EditorValue } from "@/components/RecipeEditor";
import { Button, Card, cx, ErrorText, inputClass, textareaClass } from "@/components/ui";
import { classifyPinterestUrl } from "@/lib/import/pinterest";
import { parseRecipeText } from "@/lib/import/text";
import type { ImportedRecipe } from "@/lib/import/types";

type Tab = "link" | "bulk" | "photo" | "text" | "manual";
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "link", label: "Link or pin", icon: "link" },
  { id: "bulk", label: "Many at once", icon: "board" },
  { id: "photo", label: "Photo", icon: "camera" },
  { id: "text", label: "Paste text", icon: "text" },
  { id: "manual", label: "Type it", icon: "edit" },
];

function toEditor(r: ImportedRecipe, sourceType: EditorValue["sourceType"], pinterestUrl: string | null = null): EditorValue {
  return {
    title: r.title,
    description: r.description,
    sourceUrl: r.sourceUrl,
    pinterestUrl,
    sourceType,
    imageUrl: r.imageUrl,
    servings: r.servings,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes ?? (r.totalMinutes && !r.prepMinutes ? r.totalMinutes : null),
    ingredients: r.ingredients,
    steps: r.steps,
    tags: r.tags,
    mealTypes: [],
    notes: null,
    isFavorite: false,
    isStaple: false,
    stapleEveryWeeks: null,
  };
}

const blank: ImportedRecipe = {
  title: "",
  description: null,
  imageUrl: null,
  sourceUrl: null,
  servings: 4,
  prepMinutes: null,
  cookMinutes: null,
  totalMinutes: null,
  ingredients: [],
  steps: [],
  tags: [],
};

export function AddRecipe({ aiEnabled, initialTab }: { aiEnabled: boolean; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>((TABS.find((t) => t.id === initialTab)?.id ?? "link") as Tab);
  const [draft, setDraft] = useState<{ value: EditorValue; notice: string | null; key: number } | null>(null);
  const edit = (value: EditorValue, notice: string | null = null) => setDraft({ value, notice, key: Date.now() });

  return (
    <div className="flex flex-col gap-5">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => {
              setTab(t.id);
              setDraft(t.id === "manual" ? { value: toEditor(blank, "manual"), notice: null, key: Date.now() } : null);
            }}
            className={cx(
              "flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium",
              tab === t.id ? "border-brand bg-brand text-brand-ink" : "border-line bg-surface",
            )}
          >
            <Icon name={t.icon} className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {draft ? (
        <>
          {tab !== "manual" ? (
            <button type="button" onClick={() => setDraft(null)} className="flex items-center gap-1 self-start text-sm text-muted">
              <Icon name="chevronLeft" className="size-4" /> Start over
            </button>
          ) : null}
          <RecipeEditor key={draft.key} initial={draft.value} notice={draft.notice} />
        </>
      ) : tab === "link" ? (
        <LinkImport onDone={edit} />
      ) : tab === "bulk" ? (
        <BulkImport />
      ) : tab === "photo" ? (
        <PhotoImport aiEnabled={aiEnabled} onDone={edit} onUseText={() => setTab("text")} />
      ) : tab === "text" ? (
        <TextImport onDone={edit} />
      ) : (
        <RecipeEditor initial={toEditor(blank, "manual")} />
      )}
    </div>
  );
}

function LinkImport({ onDone }: { onDone: (v: EditorValue, notice?: string | null) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setError(undefined);
      const kind = classifyPinterestUrl(url);
      if (kind?.kind === "board" || kind?.kind === "profile") {
        setError("That's a whole board. Use the “Many at once” tab to import its pins.");
        return;
      }
      const res = await importLink(url);
      if (!res.ok) return setError(res.error);
      const { recipe, pinterestUrl, message } = res.value;
      onDone(toEditor(recipe, pinterestUrl ? "pinterest" : "link", pinterestUrl), message);
    });
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-display text-xl font-semibold">Paste a recipe link or Pinterest pin</h2>
        <p className="mt-1 text-sm text-muted">
          In Pinterest, open the pin, tap <strong>Share</strong>, then <strong>Copy link</strong>. Recipe websites work too.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
        className="flex flex-col gap-3"
      >
        <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://pin.it/… or https://…" className={inputClass} autoFocus />
        <ErrorText>{error}</ErrorText>
        <Button variant="primary" size="lg" busy={pending} disabled={!url.trim()} type="submit">
          {pending ? "Reading the recipe…" : "Import"}
        </Button>
      </form>
    </Card>
  );
}

type BulkRow = { url: string; title: string; state: "waiting" | "working" | "done" | "partial" | "duplicate" | "error"; message?: string; id?: string };

function BulkImport() {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [error, setError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [pending, start] = useTransition();
  const stop = useRef(false);

  const load = () =>
    start(async () => {
      setError(undefined);
      const lines = input
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s));
      if (!lines.length) return setError("Paste a Pinterest board link, or several recipe or pin links.");
      const board = lines.length === 1 ? classifyPinterestUrl(lines[0]) : null;
      if (board?.kind === "board") {
        const res = await boardPins(lines[0]);
        if (!res.ok) return setError(res.error);
        setRows(res.value.map((p) => ({ url: p.url, title: p.title || p.url, state: "waiting" })));
      } else {
        setRows([...new Set(lines)].map((u) => ({ url: u, title: u, state: "waiting" })));
      }
    });

  const runAll = async () => {
    if (!rows) return;
    setRunning(true);
    stop.current = false;
    for (let i = 0; i < rows.length; i++) {
      if (stop.current) break;
      if (rows[i].state !== "waiting") continue;
      setRows((r) => r!.map((x, j) => (j === i ? { ...x, state: "working" } : x)));
      const res = await importAndSave(rows[i].url);
      setRows((r) =>
        r!.map((x, j) =>
          j !== i
            ? x
            : res.ok
              ? { ...x, title: res.value.title || x.title, id: res.value.id, state: res.value.status === "complete" ? "done" : res.value.status, message: res.value.message ?? undefined }
              : { ...x, state: "error", message: res.error },
        ),
      );
    }
    setRunning(false);
  };

  const counts = rows?.reduce<Record<string, number>>((c, r) => ({ ...c, [r.state]: (c[r.state] ?? 0) + 1 }), {}) ?? {};

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-display text-xl font-semibold">Bring in a lot at once</h2>
        <p className="mt-1 text-sm text-muted">
          Paste a <strong>Pinterest board</strong> link (pinterest.com/you/board-name), or paste many recipe or pin links, one per line.
        </p>
        <p className="mt-1 text-xs text-muted">Pinterest only shares a board&apos;s most recent pins (about 25). For bigger boards, paste pin links in batches.</p>
      </div>
      {!rows ? (
        <>
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={6} placeholder={"https://www.pinterest.com/you/dinner-ideas/\n\nor\n\nhttps://pin.it/abc\nhttps://www.allrecipes.com/recipe/…"} className={textareaClass} />
          <ErrorText>{error}</ErrorText>
          <Button variant="primary" size="lg" busy={pending} onClick={load} disabled={!input.trim()}>
            Find recipes
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-surface-2 px-2.5 py-1">{rows.length} links</span>
            {counts.done ? <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand">{counts.done} imported</span> : null}
            {counts.partial ? <span className="rounded-full bg-warn-soft px-2.5 py-1 text-warn">{counts.partial} need ingredients</span> : null}
            {counts.duplicate ? <span className="rounded-full bg-surface-2 px-2.5 py-1">{counts.duplicate} already saved</span> : null}
            {counts.error ? <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent">{counts.error} failed</span> : null}
          </div>
          <ul className="flex max-h-[50dvh] flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="grid size-6 shrink-0 place-items-center">
                  {r.state === "working" ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  ) : r.state === "done" ? (
                    <Icon name="check" className="size-5 text-brand" />
                  ) : r.state === "partial" ? (
                    <Icon name="edit" className="size-4 text-warn" />
                  ) : r.state === "error" ? (
                    <Icon name="x" className="size-4 text-accent" />
                  ) : r.state === "duplicate" ? (
                    <Icon name="copy" className="size-4 text-muted" />
                  ) : (
                    <span className="size-2 rounded-full bg-line" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  {r.id ? (
                    <Link href={`/recipes/${r.id}${r.state === "partial" ? "/edit" : ""}`} className="line-clamp-1 font-medium underline-offset-2 hover:underline">
                      {r.title}
                    </Link>
                  ) : (
                    <span className="line-clamp-1">{r.title}</span>
                  )}
                  {r.message ? <span className="line-clamp-2 text-xs text-muted">{r.message}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {running ? (
              <Button className="flex-1" onClick={() => (stop.current = true)}>
                Pause
              </Button>
            ) : rows.some((r) => r.state === "waiting") ? (
              <Button variant="primary" size="lg" className="flex-1" onClick={runAll}>
                Import {rows.filter((r) => r.state === "waiting").length} recipes
              </Button>
            ) : (
              <Link href="/recipes" className="flex h-12 flex-1 items-center justify-center rounded-full bg-brand font-medium text-brand-ink">
                Done, see my recipes
              </Link>
            )}
            {!running ? (
              <Button onClick={() => setRows(null)} variant="ghost">
                Clear
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted">Keep this screen open while it works. Recipes marked with a pencil need their ingredients added.</p>
        </>
      )}
    </Card>
  );
}

async function downscale(file: File, max: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

function PhotoImport({ aiEnabled, onDone, onUseText }: { aiEnabled: boolean; onDone: (v: EditorValue, notice?: string | null) => void; onUseText: () => void }) {
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!aiEnabled) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-display text-xl font-semibold">Photo import isn&apos;t switched on yet</h2>
        <p className="text-sm text-muted">
          Reading recipe cards from photos needs an Anthropic API key in the app&apos;s settings (ANTHROPIC_API_KEY). Until then, on iPhone or Android you can copy the text right out of a photo: open the photo, press and hold on the words, tap <strong>Select All</strong> then <strong>Copy</strong>, and paste it here.
        </p>
        <Button variant="primary" onClick={onUseText}>
          <Icon name="text" /> Paste recipe text instead
        </Button>
      </Card>
    );
  }

  const pick = (file: File | undefined) => {
    if (!file) return;
    start(async () => {
      setError(undefined);
      try {
        const [full, thumb] = await Promise.all([downscale(file, 1600, 0.85), downscale(file, 480, 0.75)]);
        setPreview(thumb);
        const res = await importPhoto(full.split(",")[1], "image/jpeg");
        if (!res.ok) return setError(res.error);
        onDone({ ...toEditor(res.value, "photo"), imageUrl: thumb }, "Read from your photo. Check the amounts before saving.");
      } catch {
        setError("Couldn't open that image. Try a JPEG or PNG.");
      }
    });
  };

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-display text-xl font-semibold">Snap a recipe card or cookbook page</h2>
        <p className="mt-1 text-sm text-muted">Handwritten cards work. Get the whole recipe in frame, in good light.</p>
      </div>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your photo" className="max-h-64 self-center rounded-xl object-contain" />
      ) : null}
      <ErrorText>{error}</ErrorText>
      <label className={cx("flex h-14 cursor-pointer items-center justify-center gap-2 rounded-full bg-brand font-medium text-brand-ink", pending && "pointer-events-none opacity-60")}>
        {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="camera" />}
        {pending ? "Reading your recipe…" : "Take or choose a photo"}
        <input type="file" accept="image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
    </Card>
  );
}

function TextImport({ onDone }: { onDone: (v: EditorValue, notice?: string | null) => void }) {
  const [text, setText] = useState("");
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="font-display text-xl font-semibold">Paste a recipe</h2>
        <p className="mt-1 text-sm text-muted">From a website, an email, a note, or text copied out of a photo. Put the name on the first line.</p>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} placeholder={"Grandma's Chili\nServes 6\n\nIngredients\n2 lb ground beef\n1 onion, diced\n…\n\nDirections\n1. Brown the beef…"} className={textareaClass} />
      <Button
        variant="primary"
        size="lg"
        disabled={!text.trim()}
        onClick={() => {
          const r = parseRecipeText(text);
          onDone(toEditor(r, "text"), r.ingredients.length ? null : "No ingredient lines found. Add them below, one per line.");
        }}
      >
        Continue
      </Button>
    </Card>
  );
}
