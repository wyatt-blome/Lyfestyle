"use client";
import { useEffect } from "react";
import { THEME_KEY as KEY } from "@/lib/themeBoot";
import type { ThemePref } from "@/lib/types";
import { useSettings } from "./settings";

const BG = { dark: "#0b0f0e", light: "#f4f2ed" } as const;

function resolve(pref: ThemePref): "dark" | "light" {
  if (pref === "system") return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  return pref;
}

function apply(pref: ThemePref) {
  const mode = resolve(pref);
  const root = document.documentElement;
  if (mode === "light") root.dataset.theme = "light";
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BG[mode]);
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    // Private mode: the theme still applies once settings load.
  }
}

/** Keeps the page theme in step with settings (and with the OS when set to "system"). */
export function ThemeSync() {
  const settings = useSettings();
  // undefined while settings load: leave whatever the boot script set.
  const pref = settings ? (settings.theme ?? "dark") : undefined;
  useEffect(() => {
    if (!pref) return;
    apply(pref);
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: light)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);
  return null;
}
