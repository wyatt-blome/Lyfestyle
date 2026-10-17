"use client";
import { useState } from "react";
import { useFasts } from "@/client/fasts";
import { addMetric, deleteMetric, useMetrics, useWorkoutLogs, type MetricInput } from "@/client/metrics";
import { useAllReadiness } from "@/client/readiness";
import { useSettings } from "@/client/settings";
import { useNow } from "@/client/useNow";
import { targetHoursFor } from "@/lib/fasting";
import {
  fastingHoursSeries,
  hrSeries,
  liftSeries,
  loggedLifts,
  metricSeries,
  quickScores,
  sessionsPerWeek,
  weeklySummary,
  type WeekStats,
} from "@/lib/progress";
import { dateKey, deviceTz, formatDayTime, fromLocalInput, toLocalInput } from "@/lib/time";
import type { BodyMetric } from "@/lib/types";
import { exerciseById, sessions } from "@/seed";
import { BarChart, LineChart } from "../charts";
import { shortDate } from "../charts/common";
import { Button, Card, Field, Page } from "../kit";
import { ReadinessCard } from "../ReadinessCard";
import { useToast } from "../Toast";

export function ProgressScreen() {
  const settings = useSettings();
  const fasts = useFasts();
  const logs = useWorkoutLogs();
  const metrics = useMetrics();
  const readiness = useAllReadiness();
  const now = useNow(60_000);
  const tz = settings?.tz ?? deviceTz();
  const ready = fasts && logs && metrics && readiness;

  return (
    <Page title="Progress" back="/more">
      <ReadinessCard />
      {ready && <WeeklySummary data={{ fasts, logs, readiness, metrics }} now={now} tz={tz} />}
      <MetricsCard metrics={metrics} />
      {ready && (
        <Card title="Charts">
          <div className="flex flex-col gap-6">
            <FastingChart fasts={fasts} now={now} tz={tz} target={settings ? targetHoursFor(settings.defaultProtocol, settings.customHours) : 16} />
            <BarChart
              title="Sessions per week (last 12)"
              unit="sessions"
              color="var(--color-info)"
              bars={sessionsPerWeek(logs, now, tz).map((p) => ({ label: shortDate(p.date), value: p.value, note: `week of ${shortDate(p.date)}` }))}
              empty="No sessions logged yet."
            />
            <LiftChart logs={logs} />
            <QuickChart logs={logs} />
            <LineChart
              title="4×4 heart rate"
              unit="bpm"
              empty="No 4×4 heart rates logged yet."
              series={[
                { name: "Peak", color: "var(--color-accent)", points: hrSeries(logs).map((p) => ({ date: p.date, value: p.peak })) },
                { name: "Average", color: "var(--color-info)", dashed: true, points: hrSeries(logs).map((p) => ({ date: p.date, value: p.avg })) },
              ]}
            />
            <LineChart
              title="Weight"
              unit="lb"
              empty="No weights yet."
              series={[{ name: "Weight", color: "var(--color-accent)", points: metricSeries(metrics, "weightLb", tz) }]}
            />
            <LineChart
              title="Waist"
              unit="in"
              empty="No waist measurements yet."
              series={[{ name: "Waist", color: "var(--color-info)", points: metricSeries(metrics, "waistIn", tz) }]}
            />
            <LineChart
              title="Resting heart rate"
              unit="bpm"
              empty="No resting heart rates yet."
              series={[{ name: "Resting HR", color: "var(--color-good)", points: metricSeries(metrics, "restingHr", tz) }]}
            />
          </div>
        </Card>
      )}
    </Page>
  );
}

function FastingChart({ fasts, now, tz, target }: { fasts: Parameters<typeof fastingHoursSeries>[0]; now: number; tz: string; target: number }) {
  const series = fastingHoursSeries(fasts, now, tz, 30);
  return (
    <BarChart
      title="Fasting hours per day (last 30)"
      unit="h"
      empty="No finished fasts in the last 30 days."
      target={{ value: target, label: `${target} h` }}
      bars={series.map((p) => ({
        label: shortDate(p.date),
        value: p.value,
        color: p.hit ? "var(--color-accent)" : "color-mix(in srgb, var(--color-accent) 40%, transparent)",
        note: p.value ? (p.hit ? "target hit" : "ended early") : "no fast",
      }))}
      legend={
        <ul className="flex flex-wrap gap-4 text-sm text-muted" aria-hidden>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm bg-accent" /> Target hit
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "color-mix(in srgb, var(--color-accent) 40%, transparent)" }} />{" "}
            Ended early
          </li>
        </ul>
      }
    />
  );
}

function LiftChart({ logs }: { logs: Parameters<typeof loggedLifts>[0] }) {
  const lifts = loggedLifts(logs);
  const [picked, setPicked] = useState<string | null>(null);
  const id = picked && lifts.some((l) => l.exerciseId === picked) ? picked : lifts[0]?.exerciseId;
  const name = (x: string) => exerciseById.get(x)?.name ?? x;
  return (
    <div className="flex flex-col gap-2">
      {lifts.length > 1 && (
        <Field label="Lift">
          <select value={id} onChange={(e) => setPicked(e.target.value)}>
            {lifts.map((l) => (
              <option key={l.exerciseId} value={l.exerciseId}>
                {name(l.exerciseId)} ({l.sessions})
              </option>
            ))}
          </select>
        </Field>
      )}
      <LineChart
        title={id ? `${name(id)}: heaviest load` : "Lift progression"}
        unit="lb"
        empty="No loads logged yet."
        series={id ? [{ name: name(id), color: "var(--color-accent)", points: liftSeries(logs, id) }] : []}
      />
    </div>
  );
}

function QuickChart({ logs }: { logs: Parameters<typeof quickScores>[0] }) {
  const all = quickScores(logs);
  const [picked, setPicked] = useState<string | null>(null);
  const s = all.find((q) => q.templateId === picked) ?? all[0];
  const name = (id: string) => sessions.find((t) => t.id === id)?.name ?? id;
  return (
    <div className="flex flex-col gap-2">
      {all.length > 1 && (
        <Field label="Quick 20">
          <select value={s?.templateId} onChange={(e) => setPicked(e.target.value)}>
            {all.map((q) => (
              <option key={q.templateId} value={q.templateId}>
                {q.templateId} · {name(q.templateId)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <LineChart
        title={s ? `${name(s.templateId)}: ${s.metric}` : "Quick 20 scores"}
        unit={s?.metric ?? "rounds"}
        zeroBased
        empty="No Quick 20 scores yet."
        series={s ? [{ name: s.templateId, color: "var(--color-info)", points: s.points }] : []}
      />
    </div>
  );
}

function WeeklySummary({ data, now, tz }: { data: Parameters<typeof weeklySummary>[0]; now: number; tz: string }) {
  const { thisWeek: a, lastWeek: b } = weeklySummary(data, now, tz);
  const rows: [string, (w: WeekStats) => string][] = [
    ["Fasts completed", (w) => `${w.fastsCompleted} of ${w.fastsEnded}`],
    ["Hit rate", (w) => (w.fastsEnded ? `${Math.round(w.hitRate * 100)}%` : "–")],
    ["Avg fast", (w) => (w.fastsEnded ? `${w.avgHours.toFixed(1)} h` : "–")],
    ["Sessions done", (w) => String(w.sessions)],
    ["Avg readiness", (w) => (w.avgReadiness !== undefined ? w.avgReadiness.toFixed(1) : "–")],
    ["Weight change", (w) => (w.weightChange !== undefined ? `${w.weightChange > 0 ? "+" : ""}${w.weightChange} lb` : "–")],
  ];
  return (
    <Card title="This week vs last">
      <table className="w-full text-base tabular">
        <thead>
          <tr className="text-sm text-muted">
            <th scope="col" className="py-1 text-left font-normal">
              <span className="sr-only">Measure</span>
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              This week
            </th>
            <th scope="col" className="py-1 text-right font-normal">
              Last week
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(([label, f]) => (
            <tr key={label}>
              <th scope="row" className="py-2 text-left font-normal text-muted">
                {label}
              </th>
              <td className="py-2 text-right text-lg font-semibold">{f(a)}</td>
              <td className="py-2 text-right">{f(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-sm text-muted">
        Weeks run Monday to Sunday (this week from {shortDate(a.monday)}). Weight change is the last weigh-in of the week minus the one before it.
      </p>
    </Card>
  );
}

const FIELDS: { key: Exclude<keyof MetricInput, "at">; label: string }[] = [
  { key: "weightLb", label: "Weight lb" },
  { key: "waistIn", label: "Waist in" },
  { key: "restingHr", label: "Resting HR" },
  { key: "bpSys", label: "BP systolic" },
  { key: "bpDia", label: "BP diastolic" },
];

function MetricsCard({ metrics }: { metrics?: BodyMetric[] }) {
  const toast = useToast();
  const [at, setAt] = useState(() => toLocalInput(Date.now()));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const num = (s?: string) => (s && s.trim() !== "" ? Number(s) : undefined);
  const list = metrics ?? [];
  return (
    <Card title="Body metrics">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const m: MetricInput = { at: fromLocalInput(at) };
            for (const f of FIELDS) {
              const v = num(vals[f.key]);
              if (v !== undefined) m[f.key] = v;
            }
            await addMetric(m);
            setVals({});
            setAt(toLocalInput(Date.now()));
            toast("Saved", "good");
          } catch (err) {
            toast((err as Error).message, "bad");
          }
        }}
      >
        <Field label="When">
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              <input inputMode="decimal" value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Button type="submit" variant="primary">
          Save measurement
        </Button>
      </form>
      {list.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {(showAll ? list : list.slice(0, 5)).map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="block text-base">
                  {shortDate(dateKey(m.at))}, {formatDayTime(m.at)}
                </span>
                <span className="text-sm text-muted tabular">
                  {[
                    m.weightLb !== undefined && `${m.weightLb} lb`,
                    m.waistIn !== undefined && `waist ${m.waistIn} in`,
                    m.restingHr !== undefined && `RHR ${m.restingHr}`,
                    m.bpSys !== undefined && `BP ${m.bpSys}/${m.bpDia}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <button
                type="button"
                aria-label="Delete measurement"
                className="min-w-12 text-2xl text-muted"
                onClick={async () => {
                  if (confirm("Delete this measurement?")) await deleteMetric(m.id);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > 5 && (
        <Button variant="ghost" className="mt-2 w-full" onClick={() => setShowAll((x) => !x)}>
          {showAll ? "Show fewer" : `Show all ${list.length}`}
        </Button>
      )}
    </Card>
  );
}
