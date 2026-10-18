"use client";
import { useState } from "react";
import { deleteFast, editFast, useFasts } from "@/client/fasts";
import { useSettings } from "@/client/settings";
import { useNow } from "@/client/useNow";
import { averages, bestStreak, currentStreak, dailyHours, editedTimes, elapsedMs, hitTarget } from "@/lib/fasting";
import { addDays, dateKey, formatDayTime, formatHours, toLocalInput, weekdayOf } from "@/lib/time";
import type { Fast } from "@/lib/types";
import { useFastFlows } from "../FastFlows";
import { Badge, Button, Card, Field, Page } from "../kit";
import { useToast } from "../Toast";

const WEEKS = 13;

export function FastHistoryScreen() {
  const fasts = useFasts();
  const settings = useSettings();
  const now = useNow(60_000);
  if (!fasts || !settings) return <Page title="Fast history" back="/fast">{null}</Page>;
  const tz = settings.tz;
  const a7 = averages(fasts, now, tz, 7);
  const a30 = averages(fasts, now, tz, 30);
  const ended = fasts.filter((f) => f.status !== "active");

  return (
    <Page title="Fast history" back="/fast">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Current streak" value={`${currentStreak(fasts, now, tz)} d`} />
        <Stat label="Best streak" value={`${bestStreak(fasts, tz)} d`} />
        <Stat label="7-day avg" value={a7.count ? `${a7.avgHours.toFixed(1)} h` : "–"} sub={a7.count ? `${Math.round(a7.hitRate * 100)}% hit` : ""} />
        <Stat label="30-day avg" value={a30.count ? `${a30.avgHours.toFixed(1)} h` : "–"} sub={a30.count ? `${Math.round(a30.hitRate * 100)}% hit` : ""} />
      </div>
      <Card title="Last 13 weeks">
        <Heatmap fasts={fasts} now={now} tz={tz} />
      </Card>
      <Card title="Fasts">
        {ended.length === 0 ? (
          <p className="text-muted">No finished fasts yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {ended.slice(0, 60).map((f) => (
              <FastRow key={f.id} fast={f} />
            ))}
          </ul>
        )}
      </Card>
    </Page>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-3xl bg-surface p-4">
      <div className="text-sm text-muted">{label}</div>
      <div className="text-3xl font-bold tabular">{value}</div>
      {sub && <div className="text-sm text-muted">{sub}</div>}
    </div>
  );
}

function Heatmap({ fasts, now, tz }: { fasts: Fast[]; now: number; tz: string }) {
  const days = dailyHours(fasts, tz);
  const today = dateKey(now, tz);
  // Columns are weeks (Mon–Sun), newest on the right.
  const wd = weekdayOf(today);
  const lastSunday = addDays(today, wd === 0 ? 0 : 7 - wd);
  const start = addDays(lastSunday, -(WEEKS * 7 - 1));
  const cells: { key: string; hours: number; hit: boolean; future: boolean }[] = [];
  for (let i = 0; i < WEEKS * 7; i++) {
    const key = addDays(start, i);
    const d = days.get(key);
    cells.push({ key, hours: d?.hours ?? 0, hit: d?.hit ?? false, future: key > today });
  }
  const shade = (c: (typeof cells)[number]) => {
    if (c.future) return "transparent";
    if (c.hours === 0) return "var(--color-surface-2)";
    if (!c.hit) return "color-mix(in srgb, var(--color-warn) 45%, transparent)";
    const strength = Math.min(1, 0.45 + (c.hours - 12) / 24);
    return `color-mix(in srgb, var(--color-accent) ${Math.round(strength * 100)}%, transparent)`;
  };
  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-1" style={{ gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}>
        {cells.map((c) => (
          <div
            key={c.key}
            title={`${c.key}: ${c.hours ? `${c.hours.toFixed(1)} h${c.hit ? " (target hit)" : ""}` : "no fast"}`}
            className={`aspect-square rounded ${c.key === today ? "ring-2 ring-info" : ""}`}
            style={{ background: shade(c) }}
          />
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">Orange = target hit (darker = longer). Yellow = ended early. Rows Mon → Sun.</p>
    </div>
  );
}

function FastRow({ fast }: { fast: Fast }) {
  const toast = useToast();
  const { openCheckIn } = useFastFlows();
  const [edit, setEdit] = useState(false);
  const [s, setS] = useState(toLocalInput(fast.startAt));
  const [e, setE] = useState(toLocalInput(fast.endAt ?? fast.startAt));
  const hours = elapsedMs(fast, 0);
  return (
    <li className="py-3">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setEdit((x) => !x)}>
        <span>
          <span className="block text-lg">{formatDayTime(fast.endAt!)}</span>
          <span className="text-sm text-muted">
            {fast.protocol} · {formatHours(hours)} of {fast.targetHours} h
            {fast.energy ? ` · energy ${fast.energy}/5` : ""}
          </span>
        </span>
        {hitTarget(fast) ? <Badge tone="good">Hit</Badge> : <Badge tone="warn">Early</Badge>}
      </button>
      {edit && (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Start">
            <input type="datetime-local" value={s} onChange={(ev) => setS(ev.target.value)} />
          </Field>
          <Field label="End">
            <input type="datetime-local" value={e} onChange={(ev) => setE(ev.target.value)} />
          </Field>
          {fast.notes && <p className="text-base text-muted">Notes: {fast.notes}</p>}
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  const changes = editedTimes(fast, s, e);
                  if (changes.startAt || changes.endAt) await editFast(fast.id, changes);
                  setEdit(false);
                } catch (err) {
                  toast((err as Error).message, "bad");
                }
              }}
            >
              Save
            </Button>
            <Button onClick={() => openCheckIn(fast.id)}>Check-in</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirm("Delete this fast?")) await deleteFast(fast.id);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
