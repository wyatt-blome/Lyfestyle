"use client";
import { useMemo, useState } from "react";
import { addFavorite, deleteFavorite, moveFavorite, useFavorites } from "@/client/favorites";
import { activeFast, useFasts } from "@/client/fasts";
import { deleteIntake, logIntake, useIntakeBetween, wouldBreakFast } from "@/client/intake";
import { useSettings } from "@/client/settings";
import { useNow } from "@/client/useNow";
import { db } from "@/db/db";
import { copyDayPlan, dayBounds, favoriteLabel, templateOf } from "@/lib/food";
import { addDays, dateKey, deviceTz, formatTime } from "@/lib/time";
import type { FavoriteItem, IntakeEntry } from "@/lib/types";
import { DayTimeline } from "../DayTimeline";
import { QuickDrinks, useFastFlows } from "../FastFlows";
import { FoodSearch } from "../FoodSearch";
import { Badge, Button, Card, Page } from "../kit";
import { useToast } from "../Toast";

/** Same food, same amount: used to show ★ on entries already saved as favorites. */
function sameItem(a: { name: string; qty?: number; unit?: string }, b: { name: string; qty?: number; unit?: string }) {
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.qty === b.qty && (a.unit ?? "") === (b.unit ?? "");
}

export function LogScreen() {
  const settings = useSettings();
  const tz = settings?.tz ?? deviceTz();
  const now = useNow(60_000);
  const today = dateKey(now, tz);
  const [day, setDay] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const key = day ?? today;
  const bounds = useMemo(() => dayBounds(key, tz), [key, tz]);
  const range = useMemo(
    () => [new Date(bounds.start).toISOString(), new Date(bounds.end - 1).toISOString()] as const,
    [bounds],
  );
  const entries = useIntakeBetween(range[0], range[1]);
  const fasts = useFasts();
  const favorites = useFavorites();
  const { openAddEntry } = useFastFlows();
  const protein = (entries ?? []).reduce((s, e) => s + (e.proteinG ?? 0), 0);
  const kcal = (entries ?? []).reduce((s, e) => s + (e.kcal ?? 0), 0);

  // Everything below depends on the clock and the device zone, so it renders on the device only
  // (a prerendered copy would carry the build machine's time).
  if (!settings) return <Page title="Food & drink">{null}</Page>;

  return (
    <Page title="Food & drink">
      <div className="flex items-center justify-between gap-2">
        <Button aria-label="Previous day" className="min-w-14 text-2xl" onClick={() => setDay(addDays(key, -1))}>
          ‹
        </Button>
        <span className="text-lg font-semibold">{key === today ? "Today" : key === addDays(today, -1) ? "Yesterday" : key}</span>
        <Button aria-label="Next day" className="min-w-14 text-2xl" disabled={key >= today} onClick={() => setDay(addDays(key, 1))}>
          ›
        </Button>
      </div>
      <Button variant="primary" big onClick={() => openAddEntry({ kind: "meal" })}>
        + Add food or drink
      </Button>
      <div className={`grid gap-3 ${key === today ? "grid-cols-2" : "grid-cols-1"}`}>
        <Button onClick={() => setSearchOpen(true)}>Search food</Button>
        {key === today && <CopyYesterday today={today} tz={tz} todayCount={entries?.length ?? 0} />}
      </div>
      <Card title="Day timeline">
        <DayTimeline day={bounds} fasts={fasts ?? []} entries={entries ?? []} now={now} tz={tz} />
      </Card>
      <Card title="Quick add">
        <div className="flex flex-col gap-3">
          <QuickDrinks />
          <Favorites favorites={favorites ?? []} />
        </div>
      </Card>
      <Card title="Entries" action={<span className="text-base text-muted tabular">{protein} g protein{kcal ? ` · ${kcal} kcal` : ""}</span>}>
        {!entries || entries.length === 0 ? (
          <p className="text-muted">Nothing logged.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {entries.map((e) => (
              <EntryRow key={e.id} entry={e} tz={tz} starred={(favorites ?? []).some((f) => sameItem(f.template, e))} />
            ))}
          </ul>
        )}
      </Card>
      <FoodSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </Page>
  );
}

function EntryRow({ entry: e, tz, starred }: { entry: IntakeEntry; tz: string; starred: boolean }) {
  const toast = useToast();
  return (
    <li className="flex items-center justify-between gap-2 py-3">
      <span className="min-w-0">
        <span className="block text-lg">
          {e.name}
          {e.qty ? (
            <span className="text-muted">
              {" "}
              · {e.qty} {e.unit}
            </span>
          ) : null}
        </span>
        <span className="text-sm text-muted">
          {formatTime(e.at, tz)} · {e.kind}
          {e.proteinG ? ` · ${e.proteinG} g protein` : ""}
          {e.kcal ? ` · ${e.kcal} kcal` : ""}
          {e.source === "usda" ? " · USDA" : e.source === "off" ? " · Open Food Facts" : ""}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {e.breaksFast ? <Badge tone="warn">Breaks fast</Badge> : <Badge tone="good">Fast-safe</Badge>}
        <button
          type="button"
          aria-label={starred ? `${e.name} is a favorite` : `Save ${e.name} as favorite`}
          aria-pressed={starred}
          disabled={starred}
          className={`min-w-12 text-2xl ${starred ? "text-accent" : "text-muted"}`}
          onClick={async () => {
            const t = templateOf(e);
            await addFavorite(favoriteLabel(t), t);
            toast(`★ Saved ${e.name} as a favorite`, "good");
          }}
        >
          {starred ? "★" : "☆"}
        </button>
        <button type="button" aria-label={`Delete ${e.name}`} className="min-w-12 text-2xl text-muted" onClick={() => void deleteIntake(e.id)}>
          ×
        </button>
      </span>
    </li>
  );
}

function Favorites({ favorites }: { favorites: FavoriteItem[] }) {
  const { logTemplate } = useFastFlows();
  const [editing, setEditing] = useState(false);
  if (favorites.length === 0) {
    return <p className="text-sm text-muted">Tap ☆ on an entry to save it here as a one-tap favorite.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-base text-muted">Favorites</h3>
        <Button variant="ghost" aria-pressed={editing} onClick={() => setEditing((x) => !x)}>
          {editing ? "Done" : "Edit"}
        </Button>
      </div>
      {editing ? (
        <ul className="flex flex-col divide-y divide-line">
          {favorites.map((f, i) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-1">
              <span className="min-w-0 truncate text-lg">{f.label}</span>
              <span className="flex shrink-0 gap-1">
                <Button aria-label={`Move ${f.label} up`} disabled={i === 0} onClick={() => void moveFavorite(f.id, -1)}>
                  ↑
                </Button>
                <Button aria-label={`Move ${f.label} down`} disabled={i === favorites.length - 1} onClick={() => void moveFavorite(f.id, 1)}>
                  ↓
                </Button>
                <Button variant="danger" aria-label={`Remove ${f.label}`} onClick={() => void deleteFavorite(f.id)}>
                  ×
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {favorites.map((f) => (
            <Button key={f.id} className="min-w-0" onClick={() => void logTemplate(f.template)}>
              <span className="truncate">+ {f.label}</span>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Copies yesterday's entries to today at the same clock times, only for times already passed
 * (DECISIONS-phase3 P3-2). The first entry that would break the running fast goes through
 * logTemplate so the "End fast at <time>?" prompt appears once, at the earliest breaking time.
 */
function CopyYesterday({ today, tz, todayCount }: { today: string; tz: string; todayCount: number }) {
  const toast = useToast();
  const { logTemplate } = useFastFlows();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={busy}
      onClick={async () => {
        const y = dayBounds(addDays(today, -1), tz);
        const rows = await db()
          .intake.where("at")
          .between(new Date(y.start).toISOString(), new Date(y.end).toISOString(), true, false)
          .toArray();
        const plan = copyDayPlan(rows, today, tz, Date.now());
        if (plan.copy.length === 0) {
          toast(plan.later ? "Yesterday's entries are all later than now." : "Nothing logged yesterday.", "info");
          return;
        }
        const msg =
          `Copy ${plan.copy.length} ${plan.copy.length === 1 ? "entry" : "entries"} from yesterday to today at the same times?` +
          (todayCount ? ` Today already has ${todayCount}.` : "") +
          (plan.later ? ` ${plan.later} later ${plan.later === 1 ? "one is" : "ones are"} skipped until their time comes.` : "");
        if (!confirm(msg)) return;
        setBusy(true);
        try {
          const fast = await activeFast();
          let prompted = false;
          for (const c of plan.copy) {
            const breaks = !!fast && wouldBreakFast(c.template) && Date.parse(c.at) >= Date.parse(fast.startAt);
            if (breaks && !prompted) {
              prompted = true;
              await logTemplate(c.template, c.at);
            } else {
              await logIntake(c.template, c.at);
            }
          }
          toast(`Copied ${plan.copy.length} from yesterday`, "good");
        } catch (e) {
          toast((e as Error).message, "bad");
        } finally {
          setBusy(false);
        }
      }}
    >
      Copy yesterday
    </Button>
  );
}
