"use client";
// Line chart over dates. One y-axis only: different measures go in separate charts.
import { daysBetween } from "@/lib/time";
import { CHART_HEIGHT, ChartFrame, PAD, fmt, niceTicks, shortDate, useActiveIndex, useWidth } from "./common";

export interface LineSeries {
  name: string;
  /** A CSS color, e.g. "var(--color-accent)". */
  color: string;
  dashed?: boolean;
  points: { date: string; value: number }[];
}

export function LineChart({
  title,
  series,
  unit,
  zeroBased = false,
  empty = "Nothing logged yet.",
}: {
  title: string;
  series: LineSeries[];
  unit: string;
  /** Start the y-axis at 0 (counts); otherwise fit the data (weight, HR). */
  zeroBased?: boolean;
  empty?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const { active, setActive, onKeyDown } = useActiveIndex(dates.length);
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const has = values.length > 0;
  const ticks = has ? niceTicks(zeroBased ? 0 : Math.min(...values), Math.max(...values)) : [0, 1];
  const yLo = ticks[0];
  const yHi = ticks[ticks.length - 1];
  const first = dates[0];
  const span = has ? Math.max(1, daysBetween(first, dates[dates.length - 1])) : 1;
  const innerW = width - PAD.left - PAD.right;
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const x = (date: string) => PAD.left + (dates.length === 1 ? innerW / 2 : (daysBetween(first, date) / span) * innerW);
  const y = (v: number) => PAD.top + innerH - ((v - yLo) / (yHi - yLo || 1)) * innerH;
  const activeDate = active !== null ? dates[active] : undefined;
  const lastDate = dates[dates.length - 1];
  const readDate = activeDate ?? lastDate;

  const readout = has ? (
    <>
      {series.map((s, i) => {
        const p = s.points.find((q) => q.date === readDate);
        return p ? (
          <span key={`${s.name}-${i}`}>
            {i > 0 ? " · " : ""}
            <strong className="text-ink">
              {fmt(p.value)} {unit}
            </strong>{" "}
            {series.length > 1 ? s.name.toLowerCase() : ""}
          </span>
        ) : null;
      })}
      <span> · {activeDate ? shortDate(activeDate) : `latest, ${shortDate(lastDate)}`}</span>
    </>
  ) : null;

  const summary = has
    ? series
        .map((s) => {
          const a = s.points[0];
          const b = s.points[s.points.length - 1];
          if (!a || !b) return `${s.name}: no data.`;
          const diff = b.value - a.value;
          return `${s.name}: ${s.points.length} readings, latest ${fmt(b.value)} ${unit} on ${shortDate(b.date)}, ${diff === 0 ? "no change" : `${diff > 0 ? "up" : "down"} ${fmt(Math.abs(diff))} ${unit}`} since ${shortDate(a.date)}.`;
        })
        .join(" ")
    : empty;

  const pick = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    dates.forEach((d, i) => {
      const dist = Math.abs(x(d) - px);
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    });
    setActive(best);
  };

  return (
    <ChartFrame
      title={title}
      summary={summary}
      readout={readout}
      empty={has ? undefined : empty}
      legend={
        series.length > 1 ? (
          <ul className="flex flex-wrap gap-4 text-sm text-muted" aria-hidden>
            {series.map((s, i) => (
              <li key={`${s.name}-${i}`} className="flex items-center gap-2">
                <svg width="20" height="8" aria-hidden>
                  <line x1="0" y1="4" x2="20" y2="4" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "4 3" : undefined} />
                </svg>
                {s.name}
              </li>
            ))}
          </ul>
        ) : undefined
      }
      table={{
        head: ["Date", ...series.map((s) => `${s.name} (${unit})`)],
        rows: dates.map((d) => [d, ...series.map((s) => s.points.find((p) => p.date === d)?.value ?? "–")]),
      }}
    >
      <div ref={ref} className="w-full">
        <svg
          width={width}
          height={CHART_HEIGHT}
          role="img"
          aria-label={`${title}. ${summary} Use left and right arrow keys to read values.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          onBlur={() => setActive(null)}
          className="touch-pan-y select-none"
        >
          {ticks.map((t, i) => (
            <g key={`${t}-${i}`}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth="1" />
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="14" fill="var(--color-muted)" className="tabular">
                {fmt(t)}
              </text>
            </g>
          ))}
          {has && (
            <>
              <text x={PAD.left} y={CHART_HEIGHT - 6} fontSize="14" fill="var(--color-muted)">
                {shortDate(first)}
              </text>
              {dates.length > 1 && (
                <text x={width - PAD.right} y={CHART_HEIGHT - 6} textAnchor="end" fontSize="14" fill="var(--color-muted)">
                  {shortDate(lastDate)}
                </text>
              )}
            </>
          )}
          {activeDate && (
            <line x1={x(activeDate)} x2={x(activeDate)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-muted)" strokeWidth="1" />
          )}
          {series.map((s, si) => (
            <g key={`${s.name}-${si}`}>
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed ? "6 4" : undefined}
                points={s.points.map((p) => `${x(p.date)},${y(p.value)}`).join(" ")}
              />
              {s.points.map((p, pi) => {
                const on = p.date === activeDate || (s.points.length <= 12 && !activeDate) || p.date === lastDate;
                return on ? (
                  <circle
                    key={`${p.date}-${pi}`}
                    cx={x(p.date)}
                    cy={y(p.value)}
                    r={p.date === activeDate ? 5 : 4}
                    fill={s.color}
                    stroke="var(--color-surface)"
                    strokeWidth="2"
                  />
                ) : null;
              })}
            </g>
          ))}
        </svg>
      </div>
    </ChartFrame>
  );
}
