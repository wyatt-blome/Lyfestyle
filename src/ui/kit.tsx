"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-semibold",
  secondary: "bg-surface-2 text-ink border border-line",
  ghost: "bg-transparent text-ink",
  danger: "bg-bad/15 text-bad border border-bad/40",
};

export function Button({
  children,
  variant = "secondary",
  className = "",
  big,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; big?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 ${big ? "min-h-16 text-xl" : "min-h-12 text-lg"} active:scale-[0.98] disabled:opacity-40 ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "secondary",
  className = "",
  big,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  big?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`btn inline-flex items-center justify-center gap-2 rounded-2xl px-4 ${big ? "min-h-16 text-xl" : "min-h-12 text-lg"} active:scale-[0.98] ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-3xl bg-surface p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Page({ title, children, back }: { title: string; children: ReactNode; back?: string }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-safe">
      <header className="flex min-h-12 items-center gap-2">
        {back && (
          <Link href={back} className="btn -ml-2 inline-flex min-h-12 min-w-12 items-center justify-center text-2xl" aria-label="Back">
            ‹
          </Link>
        )}
        <h1 className="text-2xl font-bold">{title}</h1>
      </header>
      {children}
    </main>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warn" | "bad" | "good" | "info" }) {
  const tones = {
    muted: "bg-surface-2 text-muted",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
    good: "bg-good/15 text-good",
    info: "bg-info/15 text-info",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm ${tones[tone]}`}>{children}</span>;
}

export function Notice({ children, tone = "warn" }: { children: ReactNode; tone?: "warn" | "bad" | "info" }) {
  const tones = {
    warn: "border-warn/40 bg-warn/10 text-warn",
    bad: "border-bad/40 bg-bad/10 text-bad",
    info: "border-info/40 bg-info/10 text-info",
  };
  return <div className={`rounded-2xl border p-3 text-base ${tones[tone]}`}>{children}</div>;
}

/** Bottom sheet dialog. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-0 mt-auto w-full max-w-none bg-transparent p-0 text-ink backdrop:bg-black/60 sm:m-auto sm:max-w-lg"
    >
      {open && (
        <div className="max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:rounded-3xl">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="min-w-12 text-2xl text-muted">
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

/** 1–5 picker with big targets. */
export function Scale({
  label,
  value,
  onChange,
  low = "Low",
  high = "High",
}: {
  label: string;
  value?: number;
  onChange: (v: number) => void;
  low?: string;
  high?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-base text-muted">{label}</legend>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            aria-pressed={value === n}
            onClick={() => onChange(n)}
            className={`min-h-12 rounded-xl text-lg tabular ${value === n ? "bg-accent text-accent-ink font-bold" : "border border-line bg-surface-2"}`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-sm text-muted">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-base text-muted">{label}</span>
      {children}
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </label>
  );
}

export function Check({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex min-h-12 items-start gap-3 py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 shrink-0" />
      <span className="text-base">{children}</span>
    </label>
  );
}
