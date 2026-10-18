"use client";
// "Search food" sheet: USDA text search or a barcode looked up in Open Food Facts. Picking a
// result opens the normal add-entry form prefilled, so nothing is logged without a look first.
import { useState, useSyncExternalStore } from "react";
import {
  cleanQuery,
  OFF_CREDIT,
  presetFromOff,
  presetFromUsda,
  USDA_CREDIT,
  type OffProduct,
  type UsdaFood,
} from "@/lib/off";
import type { IntakeTemplate } from "@/lib/types";
import { BarcodeScanner } from "./BarcodeScanner";
import { useFastFlows } from "./FastFlows";
import { Button, Card, Notice, Sheet } from "./kit";

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** navigator.onLine, live. Assumed online during prerender. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

async function getJson<T>(url: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (body as { error?: string }).error ?? `Error ${res.status}` };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check the connection." };
  }
}

type Tab = "usda" | "scan";

export function FoodSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openAddEntry } = useFastFlows();
  const [tab, setTab] = useState<Tab>("usda");
  const online = useOnline();
  const pick = (preset: Partial<IntakeTemplate>) => {
    onClose();
    openAddEntry(preset);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Search food">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Search by">
          {(
            [
              ["usda", "USDA search"],
              ["scan", "Scan barcode"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`min-h-12 rounded-xl text-base ${tab === id ? "bg-accent font-semibold text-accent-ink" : "bg-surface-2"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {!online && (
          <Notice tone="info">
            Needs a connection. You can still log anything by hand.
            <Button className="mt-2 w-full" onClick={() => pick({ kind: "meal" })}>
              Add manually
            </Button>
          </Notice>
        )}
        <div role="tabpanel">
          {tab === "usda" ? <UsdaTab online={online} onPick={pick} /> : <ScanTab online={online} onPick={pick} />}
        </div>
      </div>
    </Sheet>
  );
}

function per100(kcal?: number, protein?: number): string {
  const parts = [kcal !== undefined ? `${kcal} kcal` : null, protein !== undefined ? `${protein} g protein` : null].filter(Boolean);
  return parts.length ? `${parts.join(" · ")} per 100 g` : "No nutrition data";
}

function UsdaTab({ online, onPick }: { online: boolean; onPick: (p: Partial<IntakeTemplate>) => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [foods, setFoods] = useState<UsdaFood[] | null>(null);
  const clean = cleanQuery(q);
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        role="search"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!clean) return;
          setBusy(true);
          setError(null);
          const r = await getJson<{ foods: UsdaFood[] }>(`/api/usda?q=${encodeURIComponent(clean)}`);
          setBusy(false);
          if (r.ok) setFoods(r.data.foods);
          else {
            setFoods(null);
            setError(r.error);
          }
        }}
      >
        <input
          type="search"
          aria-label="Food name"
          value={q}
          maxLength={80}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Greek yogurt, chicken thigh…"
          enterKeyHint="search"
        />
        <Button type="submit" variant="primary" disabled={!online || !clean || busy}>
          {busy ? "…" : "Search"}
        </Button>
      </form>
      {error && <Notice tone="bad">{error}</Notice>}
      {foods && foods.length === 0 && <p className="text-muted">No matches. Try fewer words.</p>}
      {foods && foods.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {foods.map((f) => (
            <li key={f.fdcId}>
              <button type="button" className="flex w-full flex-col items-start py-3 text-left" onClick={() => onPick(presetFromUsda(f))}>
                <span className="text-lg">{f.name}</span>
                <span className="text-sm text-muted">
                  {f.brand ? `${f.brand} · ` : ""}
                  {per100(f.kcal100g, f.protein100g)}
                  {f.servingSize ? ` · serving ${f.servingSize} ${f.servingUnit ?? ""}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">{USDA_CREDIT}</p>
    </div>
  );
}

function ScanTab({ online, onPick }: { online: boolean; onPick: (p: Partial<IntakeTemplate>) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ code: string; product?: OffProduct; error?: string } | null>(null);
  const lookup = async (code: string) => {
    setBusy(true);
    const r = await getJson<OffProduct>(`/api/off/${code}`);
    setBusy(false);
    setResult(r.ok ? { code, product: r.data } : { code, error: r.error });
  };

  if (result) {
    const p = result.product;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted tabular">Barcode {result.code}</p>
        {p ? (
          <Card className="bg-surface-2">
            <div className="flex flex-col gap-1">
              <p className="text-lg font-semibold">{p.name}</p>
              {p.brand && <p className="text-base text-muted">{p.brand}</p>}
              {(p.kcalPerServing !== undefined || p.proteinPerServing !== undefined) && (
                <p className="text-base tabular">
                  Per serving{p.servingSize ? ` (${p.servingSize})` : ""}:{" "}
                  {[p.kcalPerServing !== undefined ? `${p.kcalPerServing} kcal` : null, p.proteinPerServing !== undefined ? `${p.proteinPerServing} g protein` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="text-base text-muted tabular">{per100(p.kcal100g, p.protein100g)}</p>
            </div>
          </Card>
        ) : (
          <Notice tone="warn">{result.error}</Notice>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="primary"
            onClick={() => onPick(p ? presetFromOff(p, result.code) : { kind: "snack", barcode: result.code, source: "manual" })}
          >
            {p ? "Use this" : "Add manually"}
          </Button>
          <Button onClick={() => setResult(null)}>Scan again</Button>
        </div>
        <p className="text-sm text-muted">
          {OFF_CREDIT}{" "}
          <a href={`https://world.openfoodfacts.org/product/${result.code}`} target="_blank" rel="noreferrer" className="btn inline-flex min-h-12 items-center text-info underline">
            View on Open Food Facts
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <BarcodeScanner onCode={(c) => void lookup(c)} disabled={!online || busy} />
      {busy && <p className="text-muted">Looking up…</p>}
      <p className="text-sm text-muted">Products from Open Food Facts (ODbL).</p>
    </div>
  );
}
