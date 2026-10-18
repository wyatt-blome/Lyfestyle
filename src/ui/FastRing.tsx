"use client";
import { formatClock } from "@/lib/time";

/** The big progress ring: elapsed in the middle, remaining underneath. */
export function FastRing({
  fraction,
  elapsedMs,
  remainingMs,
  reached,
  size = 280,
  caption,
}: {
  fraction: number;
  elapsedMs: number;
  remainingMs: number;
  reached: boolean;
  size?: number;
  caption?: string;
}) {
  const stroke = 18;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size, maxWidth: "100%" }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={reached ? "var(--color-good)" : "var(--color-accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, fraction))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" role="timer" aria-live="off">
        <span className="text-sm uppercase tracking-wide text-muted">{caption ?? "Fasting"}</span>
        <span className="text-5xl font-bold tabular">{formatClock(elapsedMs)}</span>
        <span className={`mt-1 text-lg tabular ${reached ? "text-good" : "text-muted"}`}>
          {reached ? "Target reached" : `${formatClock(remainingMs)} to go`}
        </span>
      </div>
    </div>
  );
}
