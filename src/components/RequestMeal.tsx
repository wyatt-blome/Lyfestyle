"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { dismissRequest, planRequest, requestMeal } from "@/actions/requests";
import { Icon } from "./icons";
import { Button, Card, Chip, cx, ErrorText, inputClass, Sheet } from "./ui";

export interface RequestRecipe {
  id: string;
  title: string;
  imageUrl: string | null;
}

export interface OpenRequest {
  id: string;
  recipeId: string | null;
  title: string;
  isIdea: boolean;
  requestedBy: string | null;
  forWeek: boolean;
}

const NAME_KEY = "mp_name";
function rememberedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/** "Request a meal" button and sheet: pick a recipe or describe an idea, and say who's asking. */
export function RequestMealButton({
  recipes,
  thisWeek,
  nextWeek,
  recipe,
  className,
  variant = "secondary",
}: {
  recipes: RequestRecipe[];
  thisWeek: string;
  nextWeek: string;
  /** preselect this recipe (from a recipe page) */
  recipe?: RequestRecipe;
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        <Icon name="sparkle" className="size-4" /> {recipe ? "Request this" : "Request a meal"}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={recipe ? `Request ${recipe.title}` : "Request a meal"}>
        {open ? <RequestForm recipes={recipes} thisWeek={thisWeek} nextWeek={nextWeek} preset={recipe} onDone={() => setOpen(false)} /> : null}
      </Sheet>
    </>
  );
}

function RequestForm({
  recipes,
  thisWeek,
  nextWeek,
  preset,
  onDone,
}: {
  recipes: RequestRecipe[];
  thisWeek: string;
  nextWeek: string;
  preset?: RequestRecipe;
  onDone: () => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<RequestRecipe | null>(preset ?? null);
  const [query, setQuery] = useState("");
  const [name, setName] = useState(rememberedName);
  const [when, setWhen] = useState<string | null>(thisWeek);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return recipes.filter((r) => r.title.toLowerCase().includes(q)).slice(0, 8);
  }, [query, recipes]);
  const idea = !picked && query.trim();

  const submit = () =>
    start(async () => {
      setError(undefined);
      try {
        window.localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        /* not remembered; fine */
      }
      const res = await requestMeal({
        recipeId: picked?.id ?? null,
        text: picked ? null : query.trim() || null,
        requestedBy: name.trim() || null,
        weekStart: when,
      });
      if (!res.ok) return setError(res.error);
      router.refresh();
      onDone();
    });

  return (
    <div className="flex flex-col gap-4">
      {picked ? (
        <div className="flex items-center gap-3 rounded-2xl border border-brand bg-brand-soft p-2">
          {picked.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picked.imageUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-xl object-cover" />
          ) : null}
          <span className="min-w-0 flex-1 font-medium">{picked.title}</span>
          {!preset ? (
            <button type="button" onClick={() => setPicked(null)} aria-label="Pick something else" className="grid size-9 place-items-center rounded-full">
              <Icon name="x" className="size-4" />
            </button>
          ) : null}
        </div>
      ) : (
        <div>
          <label className="text-sm font-medium" htmlFor="request-what">
            What would you like?
          </label>
          <input
            id="request-what"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes, or describe it (“something with shrimp”)"
            className={cx(inputClass, "mt-1.5")}
            autoFocus
          />
          {matches.length ? (
            <ul className="mt-2 flex flex-col">
              {matches.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setPicked(r)} className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
                    <Icon name="book" className="size-4 text-muted" /> {r.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : idea ? (
            <p className="mt-2 text-xs text-muted">No recipe by that name; it&apos;ll be sent as an idea, and the plan will lean toward it.</p>
          ) : null}
        </div>
      )}
      <div>
        <span className="text-sm font-medium">When?</span>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <Chip selected={when === thisWeek} onClick={() => setWhen(thisWeek)}>
            This week
          </Chip>
          <Chip selected={when === nextWeek} onClick={() => setWhen(nextWeek)}>
            Next week
          </Chip>
          <Chip selected={when === null} onClick={() => setWhen(null)}>
            Whenever
          </Chip>
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Your name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="So everyone knows who asked" className={inputClass} />
      </label>
      <ErrorText>{error}</ErrorText>
      <Button variant="primary" size="lg" busy={pending} disabled={!picked && !query.trim()} onClick={submit}>
        Send request
      </Button>
    </div>
  );
}

/** Open requests on the week screen, with a way to add each to the plan or set it aside. */
export function RequestsCard({ requests, weekStart, canPlan }: { requests: OpenRequest[]; weekStart: string; canPlan: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (!requests.length) return null;
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(undefined);
      const res = await fn();
      if (!res.ok && "error" in res) setError(res.error);
      router.refresh();
    });
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Icon name="sparkle" className="size-5 text-accent" /> Requests ({requests.length})
      </p>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{r.isIdea ? `“${r.title}”` : r.title}</p>
              <p className="text-xs text-muted">
                {r.requestedBy ? `From ${r.requestedBy}` : "Requested"}
                {r.forWeek ? " for this week" : ""}
                {r.isIdea ? " · an idea; the plan will lean toward it" : ""}
              </p>
            </div>
            {canPlan && r.recipeId ? (
              <Button size="sm" variant="ghost" className="text-brand" disabled={pending} onClick={() => act(() => planRequest(r.id, weekStart))}>
                Add
              </Button>
            ) : null}
            <button
              type="button"
              aria-label="Set this request aside"
              disabled={pending}
              onClick={() => act(() => dismissRequest(r.id))}
              className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2"
            >
              <Icon name="x" className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
