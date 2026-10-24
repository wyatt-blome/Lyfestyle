"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { boardPins, countScansNotIn, importAndSave, importLink, importRecipeFile, removeScansNotIn } from "@/actions/recipes";
import { Icon, type IconName } from "@/components/icons";
import { RecipeEditor, type EditorValue } from "@/components/RecipeEditor";
import { Button, Card, cx, ErrorText, inputClass, textareaClass } from "@/components/ui";
import { classifyPinterestUrl } from "@/lib/import/pinterest";
import { parseRecipeText } from "@/lib/import/text";
import type { ImportedRecipe } from "@/lib/import/types";
import { PhotoImport } from "./PhotoImport";

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
  // A board pasted into "Link or pin" moves over to "Many at once".
  const [boardLink, setBoardLink] = useState<string | null>(null);
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
        <LinkImport
          onDone={edit}
          onBoard={(url) => {
            setBoardLink(url);
            setTab("bulk");
          }}
        />
      ) : tab === "bulk" ? (
        <BulkImport key={boardLink ?? ""} initial={boardLink ?? ""} />
      ) : tab === "photo" ? (
        <PhotoImport aiEnabled={aiEnabled} onUseText={() => setTab("text")} />
      ) : tab === "text" ? (
        <TextImport onDone={edit} />
      ) : (
        <RecipeEditor initial={toEditor(blank, "manual")} />
      )}
    </div>
  );
}

function LinkImport({ onDone, onBoard }: { onDone: (v: EditorValue, notice?: string | null) => void; onBoard: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setError(undefined);
      const kind = classifyPinterestUrl(url);
      if (kind?.kind === "board") return onBoard(url.trim());
      const res = await importLink(url);
      if (!res.ok) return res.board ? onBoard(url.trim()) : setError(res.error);
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

function BulkImport({ initial = "" }: { initial?: string }) {
  const [input, setInput] = useState(initial);
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
      // One Pinterest link may be a board, including the pin.it link the app's Share button copies.
      const kind = lines.length === 1 ? classifyPinterestUrl(lines[0])?.kind : null;
      const res = kind === "board" || kind === "short" || kind === "profile" ? await boardPins(lines[0]) : null;
      if (res && !res.ok) return setError(res.error);
      if (res?.ok && res.value.board) {
        setRows(res.value.pins.map((p) => ({ url: p.url, title: p.title || p.url, state: "waiting" })));
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
          Paste a <strong>Pinterest board</strong> link, or many recipe or pin links, one per line. To copy a board&apos;s link in the Pinterest app, open the board,
          tap <strong>Share</strong>, then <strong>Copy link</strong>.
        </p>
        <p className="mt-1 text-xs text-muted">Pinterest only shares a board&apos;s most recent pins (about 25). For bigger boards, paste pin links in batches.</p>
      </div>
      {!rows ? (
        <>
          <FileImport />
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={6} placeholder={"https://www.pinterest.com/you/dinner-ideas/\n\nor\n\nhttps://pin.it/abc\nhttps://www.allrecipes.com/recipe/…"} className={textareaClass} />
          {initial && input === initial && !error ? <p className="text-sm text-brand">That link is a whole board. Tap Find recipes to list its pins.</p> : null}
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

type FilePlan = { recipes: unknown[]; titles: string[]; oldScans: number };

const FILE_BATCH = 20;

function FileImport() {
  const [plan, setPlan] = useState<FilePlan | null>(null);
  const [clearOld, setClearOld] = useState(true);
  const [progress, setProgress] = useState<string>();
  const [result, setResult] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const pick = (file: File) =>
    start(async () => {
      setError(undefined);
      setResult(undefined);
      let data: unknown;
      try {
        data = JSON.parse(await file.text());
      } catch {
        return setError("That file isn't a recipe file (it isn't valid JSON).");
      }
      const recipes = Array.isArray(data) ? data : (data as { recipes?: unknown })?.recipes;
      if (!Array.isArray(recipes) || !recipes.length) return setError("No recipes found in that file.");
      const titles = recipes.map((r) => String((r as { title?: unknown })?.title ?? "")).filter(Boolean);
      const oldScans = await countScansNotIn(titles);
      setClearOld(true);
      setPlan({ recipes, titles, oldScans });
    });

  // Sent in small batches so a big file can't time out halfway; a batch that's run twice just
  // replaces the same recipes again.
  const run = () =>
    start(async () => {
      if (!plan) return;
      setError(undefined);
      let removed = 0;
      if (clearOld && plan.oldScans) {
        setProgress("Removing the old photo recipes…");
        const res = await removeScansNotIn(plan.titles);
        if (!res.ok) return setError(res.error);
        removed = res.value.deleted;
      }
      const total = { added: 0, replaced: 0, skipped: 0, invalid: 0 };
      for (let i = 0; i < plan.recipes.length; i += FILE_BATCH) {
        setProgress(`Importing ${Math.min(i + FILE_BATCH, plan.recipes.length)} of ${plan.recipes.length}…`);
        const res = await importRecipeFile(JSON.stringify({ recipes: plan.recipes.slice(i, i + FILE_BATCH) })).catch(() => null);
        if (!res?.ok) {
          setProgress(undefined);
          return setError(`${res?.error ?? "The connection dropped."} ${total.added + total.replaced} were saved; pick the file again to finish (nothing is added twice).`);
        }
        total.added += res.value.added;
        total.replaced += res.value.replaced;
        total.skipped += res.value.skipped.length;
        total.invalid += res.value.invalid;
      }
      setProgress(undefined);
      setPlan(null);
      setResult(
        [
          removed ? `Removed ${removed} old photo recipe${removed === 1 ? "" : "s"}.` : "",
          `Added ${total.added} recipe${total.added === 1 ? "" : "s"}.`,
          total.replaced ? `Updated ${total.replaced} that were already there.` : "",
          total.skipped ? `${total.skipped} skipped: a recipe you added another way has the same name.` : "",
          total.invalid ? `${total.invalid} couldn't be read.` : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    });

  return (
    <div className="rounded-2xl border border-dashed border-line p-3 text-sm">
      <p className="font-medium">Have a recipe file?</p>
      <p className="text-xs text-muted">A .json recipe file, such as one made from a stack of photos.</p>
      {plan ? (
        <div className="mt-3 flex flex-col gap-3">
          <p>
            <strong>{plan.recipes.length}</strong> recipes in this file.
          </p>
          {plan.oldScans ? (
            <label className="flex items-start gap-3 rounded-xl bg-warn-soft p-3">
              <input type="checkbox" checked={clearOld} onChange={(e) => setClearOld(e.target.checked)} className="mt-0.5 size-5 accent-[var(--brand)]" />
              <span>
                First remove the <strong>{plan.oldScans}</strong> recipe{plan.oldScans === 1 ? "" : "s"} read from photos or pasted text that aren&apos;t in this file. Recipes
                from links, Pinterest or typed by hand stay.
              </span>
            </label>
          ) : null}
          <p className="text-xs text-muted">Recipes already here with the same name are updated from the file; their stars, favorites and plans stay.</p>
          {progress ? <p className="text-brand">{progress}</p> : null}
          <div className="flex gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => setPlan(null)}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" busy={pending} onClick={run}>
              Import {plan.recipes.length} recipes
            </Button>
          </div>
        </div>
      ) : (
        <label className={cx("mt-2 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 font-medium", pending && "opacity-60")}>
          {pending ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Icon name="plus" className="size-4" />}
          Import a recipe file
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) pick(file);
            }}
          />
        </label>
      )}
      {result ? (
        <p className="mt-2 text-brand">
          {result}{" "}
          <Link href="/recipes" className="underline underline-offset-2">
            See recipes
          </Link>
        </p>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </div>
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
