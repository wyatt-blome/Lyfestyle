"use client";
// Bar chart over evenly spaced categories (days or weeks). Bars start at 0.
import { CHART_HEIGHT, ChartFrame, PAD, fmt, niceTicks, useActiveIndex, useWidth } from "./common";

export interface Bar {
  /** Short axis/readout label, e.g. "Oct 14". */
  label: string;
  value: number;
  /** Optional color for this bar (defaults to the chart color); the note says why in words. */
  color?: string;
  note?: string;
}

export function BarChart({
  title,
  bars,
  unit,
  color = "var(--color-accent)",
  empty = "Nothing logged yet.",
  legend,
  target,
}: {
  title: string;
  bars: Bar[];
  unit: string;
  color?: string;
  empty?: string;
  legend?: React.ReactNode;
  /** Optional dashed reference line (e.g. 16 h). */
  target?: { value: number; label: string };
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const { active, setActive, onKeyDown } = useActiveIndex(bars.length);
  const has = bars.some((b) => b.value > 0);
  const max = Math.max(1, ...bars.map((b) => b.value), target?.value ?? 0);
  const ticks = niceTicks(0, max);
  const yHi = ticks[ticks.length - 1];
  const innerW = width - PAD.left - PAD.right;
  const innerH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, bars.length);
  const gap = Math.min(4, slot * 0.25);
  const bw = Math.max(2, slot - gap);
  const y = (v: number) => PAD.top + innerH - (v / yHi) * innerH;
  const shown = active !== null ? bars[active] : bars[bars.length - 1];
  const total = bars.reduce((s, b) => s + b.value, 0);
  const nonZero = bars.filter((b) => b.value > 0);
  const avg = nonZero.length ? total / nonZero.length : 0;
  const summary = has
    ? `${bars.length} bars from ${bars[0].label} to ${bars[bars.length - 1].label}. ${nonZero.length} with a value, average ${fmt(avg)} ${unit}, highest ${fmt(Math.max(...bars.map((b) => b.value)))} ${unit}.`
    : empty;
  // Label every bar when few, else about six evenly spaced.
  const every = Math.max(1, Math.ceil(bars.length / 6));

  const pick = (clientX: number, rect: DOMRect) => {
    const i = Math.floor((clientX - rect.left - PAD.left) / slot);
    setActive(Math.min(bars.length - 1, Math.max(0, i)));
  };

  return (
    <ChartFrame
      title={title}
      summary={summary}
      empty={has ? undefined : empty}
      legend={legend}
      readout={
        shown ? (
          <>
            <strong className="text-ink">
              {fmt(shown.value)} {unit}
            </strong>{" "}
            · {shown.label}
            {shown.note ? ` · ${shown.note}` : ""}
          </>
        ) : null
      }
      table={{ head: ["Period", `${title} (${unit})`], rows: bars.map((b) => [b.label, b.note ? `${fmt(b.value)} (${b.note})` : fmt(b.value)]) }}
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
              <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--color-muted)" className="tabular">
                {fmt(t)}
              </text>
            </g>
          ))}
          {target && (
            <g>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(target.value)}
                y2={y(target.value)}
                stroke="var(--color-muted)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text x={width - PAD.right} y={y(target.value) - 4} textAnchor="end" fontSize="12" fill="var(--color-muted)">
                {target.label}
              </text>
            </g>
          )}
          {bars.map((b, i) => {
            const x = PAD.left + i * slot + gap / 2;
            const h = Math.max(0, PAD.top + innerH - y(b.value));
            const r = Math.min(4, bw / 2, h);
            const top = PAD.top + innerH - h;
            // Rounded top only, square at the baseline.
            const d =
              h <= 0
                ? ""
                : `M${x},${PAD.top + innerH} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${PAD.top + innerH} Z`;
            return (
              <g key={i}>
                {d && <path d={d} fill={b.color ?? color} opacity={active === null || active === i ? 1 : 0.55} />}
                {i % every === 0 ? (
                  <text
                    x={i === 0 ? x : i + every > bars.length - 1 && bars.length > 1 ? x + bw : x + bw / 2}
                    y={CHART_HEIGHT - 6}
                    textAnchor={i === 0 ? "start" : i + every > bars.length - 1 && bars.length > 1 ? "end" : "middle"}
                    fontSize="12"
                    fill="var(--color-muted)"
                  >
                    {b.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}
