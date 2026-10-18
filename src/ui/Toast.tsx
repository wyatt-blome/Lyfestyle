"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface ToastItem {
  id: number;
  text: string;
  tone: "info" | "good" | "bad";
}

const Ctx = createContext<(text: string, tone?: ToastItem["tone"]) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastItem["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
  }, []);
  // Solid backgrounds: a see-through toast over the page heading is unreadable.
  const tones = { info: "bg-surface-2 border-line", good: "bg-surface-2 border-good/60 text-good", bad: "bg-surface-2 border-bad/60 text-bad" };
  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-50 flex flex-col items-center gap-2 px-4"
      >
        {items.map((t) => (
          <div key={t.id} className={`pointer-events-auto w-full max-w-md rounded-2xl border p-3 text-base shadow-lg ${tones[t.tone]}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
