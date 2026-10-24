"use client";

import { cx } from "./ui";

const STAR = "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z";

function Star({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={STAR} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** Read-only stars for cards and lists. */
export function StarsShown({ rating, className = "size-3.5" }: { rating: number | null; className?: string }) {
  if (!rating) return null;
  return (
    <span className="inline-flex items-center text-[#d99a1e]" aria-label={`${rating} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= rating} className={cx(className, n > rating && "opacity-35")} />
      ))}
    </span>
  );
}

/** Tap a star to rate; tap the same star again to clear the rating. */
export function StarRating({ value, onChange, size = "size-8" }: { value: number | null; onChange: (v: number | null) => void; size?: string }) {
  return (
    <div className="inline-flex items-center gap-0.5 text-[#d99a1e]" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(value === n ? null : n)}
          className="grid place-items-center rounded-full p-0.5 transition active:scale-90"
        >
          <Star filled={value !== null && n <= value} className={cx(size, (value === null || n > value) && "text-line")} />
        </button>
      ))}
    </div>
  );
}
