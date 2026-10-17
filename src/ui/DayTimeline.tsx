"use client";
// A 24-hour bar for one local day: fasting vs eating time from the Fast records, with a marker
// for every food/drink entry at its time. Filled markers broke a fast; hollow ones are fast-safe.
import { useState } from "react";
import { daySegments, fractionOfDay, segmentHours, type Interval } from "@/lib/food";
import { formatTime } from "@/lib/time";
import type { Fast, IntakeEntry } from "@/lib/types";

const FILL = {
  fasting: "var(--color-accent)",
  eating: "color-mix(in srgb, var(--color-info) 55%, transparent)",
  future: "transparent",
};

export function DayTimeline({
  day,
  fasts,
  entries,
  now,
  tz,
}: {
  day: Interval;
  fasts: Fast[];
  entries: IntakeEntry[];
  now: number;
  tz: string;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const segs = daySegments(fasts, day, now);
  const hours = segmentHours(segs);
  const sorted = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  const pickedEntry = sorted.find((e) => e.id === picked);
  const hasFast = hours.fasting > 0;
  const ticks = [0, 6, 12, 18, 24].map((h) => ({
    h,
    at: Math.min(day.end, day.start + h * 3_600_000),
    label: h === 0 || h === 24 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`,
  }));
  const nowFrac = now > day.start && now < day.end ? fractionOfDay(now, day) : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-base tabular">
        <span className="font-semibold">{hours.fasting.toFixed(1)} h</span> fasting ·{" "}
        <span className="font-semibold">{hours.eating.toFixed(1)} h</span> {hasFast ? "eating" : "not in a fast"}
      </p>
      <div className="relative pt-6" aria-hidden>
        {/* Entry markers sit above the bar; tap one to read it. */}
        {sorted.map((e) => {
          const left = fractionOfDay(Date.parse(e.at), day) * 100;
          return (
            <button
              key={e.id}
              type="button"
              tabIndex={-1}
              onClick={() => setPicked(picked === e.id ? null : e.id)}
              className="absolute top-0 flex h-6 w-6 -translate-x-1/2 items-center justify-center"
              // Inline because the global 48px button rule outranks utility classes. The entry list
              // below has full-size targets; these dots are a glanceable extra.
              style={{ left: `${left}%`, minHeight: 0 }}
            >
              <span
                className="block h-3 w-3 rounded-full border-2"
                style={{
                  borderColor: e.breaksFast ? "var(--color-ink)" : "var(--color-muted)",
                  background: e.breaksFast ? "var(--color-ink)" : "var(--color-surface)",
                  outline: picked === e.id ? "2px solid var(--color-info)" : undefined,
                }}
              />
            </button>
          );
        })}
        <div className="relative flex h-8 overflow-hidden rounded-lg border border-line bg-surface-2">
          {segs.map((s) => (
            <div
              key={`${s.kind}-${s.start}`}
              style={{
                width: `${((s.end - s.start) / (day.end - day.start)) * 100}%`,
                background: FILL[s.kind],
                backgroundImage:
                  s.kind === "future"
                    ? "repeating-linear-gradient(135deg, transparent 0 6px, color-mix(in srgb, var(--color-line) 80%, transparent) 6px 8px)"
                    : undefined,
              }}
            />
          ))}
          {nowFrac !== null && <div className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${nowFrac * 100}%` }} />}
        </div>
        <div className="relative mt-1 h-5 text-sm text-muted">
          {ticks.map((t, i) => (
            <span
              key={t.h}
              className={`absolute ${i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${fractionOfDay(t.at, day) * 100}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>
      <p className="min-h-6 text-sm text-muted" aria-live="polite">
        {pickedEntry
          ? `${formatTime(pickedEntry.at, tz)} · ${pickedEntry.name}${pickedEntry.breaksFast ? " · breaks fast" : " · fast-safe"}`
          : sorted.length
            ? "Tap a dot to see the entry."
            : ""}
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-hidden>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: FILL.fasting }} /> Fasting
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm" style={{ background: FILL.eating }} /> {hasFast ? "Eating" : "No fast logged"}
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-ink" /> Breaks fast
        </li>
        <li className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-muted" /> Fast-safe
        </li>
      </ul>
      <p className="sr-only">
        {segs
          .filter((s) => s.kind !== "future")
          .map((s) => `${s.kind === "fasting" ? "Fasting" : "Eating"} ${formatTime(s.start, tz)} to ${formatTime(s.end, tz)}.`)
          .join(" ")}{" "}
        {sorted.map((e) => `${formatTime(e.at, tz)} ${e.name}.`).join(" ")}
      </p>
    </div>
  );
}
