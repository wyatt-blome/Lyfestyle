"use client";
// Shared pieces for the small inline-SVG charts: container width, tick math, the readout line
// (tap or hover a point to read its value) and the screen-reader data table.
import { useEffect, useRef, useState, type ReactNode } from "react";

export const CHART_HEIGHT = 168;
export const PAD = { top: 12, right: 12, bottom: 24, left: 36 };

/** Width of the chart's box in CSS px, so SVG text stays at its real size. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** About three round tick values covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count = 3): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0];
  if (hi === lo) {
    hi = lo + 1;
    lo = Math.max(0, lo - 1);
  }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1000) / 1000);
  if (out[out.length - 1] < hi) out.push(Math.round((out[out.length - 1] + step) * 1000) / 1000);
  return out;
}

/** "Oct 14" from YYYY-MM-DD. */
export function shortDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export interface ChartFrameProps {
  title: string;
  /** One-sentence summary read before the table, e.g. "Latest 45 lb, up 10 lb since Oct 1." */
  summary: string;
  readout: ReactNode;
  legend?: ReactNode;
  table: { head: string[]; rows: (string | number)[][] };
  children: ReactNode;
  empty?: string;
}

/** Title, live readout, the SVG, and a visually hidden table with every value. */
export function ChartFrame({ title, summary, readout, legend, table, children, empty }: ChartFrameProps) {
  return (
    <figure className="flex flex-col gap-2" aria-label={title}>
      <figcaption className="flex flex-col">
        <span className="text-base font-semibold">{title}</span>
        <span className="min-h-6 text-sm text-muted tabular" aria-live="polite">
          {empty ?? readout}
        </span>
      </figcaption>
      {legend}
      {empty ? null : children}
      <p className="sr-only">{summary}</p>
      {!empty && (
        <table className="sr-only">
          <caption>{title}</caption>
          <thead>
            <tr>
              {table.head.map((h, i) => (
                <th key={`${h}-${i}`} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  );
}

/** Keyboard and pointer selection of the nearest index along x. */
export function useActiveIndex(count: number) {
  const [active, setActive] = useState<number | null>(null);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (count === 0) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      setActive((a) => Math.min(count - 1, Math.max(0, (a ?? (dir > 0 ? -1 : count)) + dir)));
    } else if (e.key === "Escape") setActive(null);
  };
  return { active, setActive, onKeyDown };
}
