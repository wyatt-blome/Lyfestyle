// Plain module (not "use client") so the server layout gets the actual string.
export const THEME_KEY = "fm-theme";

/**
 * Runs in <head> before first paint, so a light-theme phone never flashes dark. It reads the
 * last choice from localStorage (settings live in IndexedDB, which is async).
 */
export const THEME_BOOT = `try{var p=localStorage.getItem("${THEME_KEY}");var l=p==="light"||(p==="system"&&matchMedia("(prefers-color-scheme: light)").matches);if(l)document.documentElement.dataset.theme="light"}catch(e){}`;
