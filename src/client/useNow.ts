"use client";
import { useEffect, useState } from "react";

/**
 * The current time, refreshed every `everyMs` and whenever the app comes back to the foreground.
 * Displays only: every duration is computed from stored timestamps, never from tick counts.
 */
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, everyMs);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", tick);
    };
  }, [everyMs]);
  return now;
}
