"use client";
// Workout cues: Web Audio beeps (unlocked on the first tap), optional speech, vibration, and a
// screen wake lock that is re-acquired when the app returns to the foreground.
import { useEffect } from "react";

let ctx: AudioContext | null = null;

/** Call from a tap handler: iOS only allows audio after a user gesture. */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    // A silent blip finishes the unlock on iOS.
    beep(1, 0.001, 0);
  } catch {
    ctx = null;
  }
}

export function beep(freq = 880, seconds = 0.15, volume = 0.3): void {
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds + 0.02);
  } catch {
    // Audio is best-effort.
  }
}

export function tick(): void {
  beep(660, 0.12, 0.25);
}

export function go(): void {
  beep(990, 0.45, 0.35);
}

export function finish(): void {
  beep(990, 0.25, 0.35);
  setTimeout(() => beep(1320, 0.5, 0.35), 300);
}

export function speak(text: string): void {
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    // Speech is optional.
  }
}

export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported on iOS.
  }
}

/** Keep the screen on while `active`. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        if (document.visibilityState !== "visible") return;
        lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock.release();
      } catch {
        // Denied (low battery, etc.): carry on without it.
      }
    };
    void acquire();
    const onVis = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
