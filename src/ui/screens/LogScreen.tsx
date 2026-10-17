"use client";
import { useMemo, useState } from "react";
import { deleteIntake, useIntakeBetween } from "@/client/intake";
import { useSettings } from "@/client/settings";
import { useNow } from "@/client/useNow";
import { addDays, dateKey, formatTime } from "@/lib/time";
import { QuickDrinks, useFastFlows } from "../FastFlows";
import { Badge, Button, Card, Page } from "../kit";

/** Start of a local day as a UTC instant (device zone). */
function dayStartIso(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toISOString();
}

export function LogScreen() {
  const settings = useSettings();
  const now = useNow(60_000);
  const today = dateKey(now, settings?.tz);
  const [day, setDay] = useState<string | null>(null);
  const key = day ?? today;
  const range = useMemo(() => [dayStartIso(key), dayStartIso(addDays(key, 1))] as const, [key]);
  const entries = useIntakeBetween(range[0], range[1]);
  const { openAddEntry } = useFastFlows();
  const protein = (entries ?? []).reduce((s, e) => s + (e.proteinG ?? 0), 0);
  const kcal = (entries ?? []).reduce((s, e) => s + (e.kcal ?? 0), 0);

  return (
    <Page title="Food & drink">
      <div className="flex items-center justify-between gap-2">
        <Button aria-label="Previous day" onClick={() => setDay(addDays(key, -1))}>
          ‹
        </Button>
        <span className="text-lg font-semibold">{key === today ? "Today" : key}</span>
        <Button aria-label="Next day" disabled={key >= today} onClick={() => setDay(addDays(key, 1))}>
          ›
        </Button>
      </div>
      <Button variant="primary" big onClick={() => openAddEntry({ kind: "meal" })}>
        + Add food or drink
      </Button>
      <Card title="Quick add">
        <QuickDrinks />
      </Card>
      <Card title="Entries" action={<span className="text-base text-muted tabular">{protein} g protein{kcal ? ` · ${kcal} kcal` : ""}</span>}>
        {!entries || entries.length === 0 ? (
          <p className="text-muted">Nothing logged.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-3">
                <span>
                  <span className="block text-lg">
                    {e.name}
                    {e.qty ? <span className="text-muted"> · {e.qty} {e.unit}</span> : null}
                  </span>
                  <span className="text-sm text-muted">
                    {formatTime(e.at)} · {e.kind}
                    {e.proteinG ? ` · ${e.proteinG} g protein` : ""}
                    {e.kcal ? ` · ${e.kcal} kcal` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {e.breaksFast ? <Badge tone="warn">Breaks fast</Badge> : <Badge tone="good">Fast-safe</Badge>}
                  <button
                    type="button"
                    aria-label={`Delete ${e.name}`}
                    className="min-w-12 text-2xl text-muted"
                    onClick={() => void deleteIntake(e.id)}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-sm text-muted">Favorites, copy-yesterday, the day timeline and barcode scanning arrive in Phase 3.</p>
    </Page>
  );
}
