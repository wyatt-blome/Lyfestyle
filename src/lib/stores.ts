import type { Store } from "./ingredients/catalog";

// Links into Walmart and Sam's Club. Neither offers a public API for building a pickup cart, so
// the app opens each item in the store's own site or app, where the household's account,
// pickup store and substitutions already live. Products a household picks once are remembered
// and linked directly next time.

export function searchQuery(name: string, buyText: string | null, store: Store): string {
  const base = name.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  if (store === "sams" || !buyText) return base;
  // "16 oz tub" → "sour cream 16 oz"; skip counts like "1 onion" that add nothing.
  const size = buyText.match(/\b(\d+(?:\.\d+)?\s*(?:oz|lb|fl oz|ct|count|pack|gallon|quart|pint))\b/i);
  return size ? `${base} ${size[1]}` : base;
}

export function searchUrl(store: Store, query: string): string {
  const q = encodeURIComponent(query.trim());
  return store === "walmart" ? `https://www.walmart.com/search?q=${q}` : `https://www.samsclub.com/s/${q}`;
}

export function parseProductUrl(store: Store, input: string): { url: string; itemId: string | null } | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (store === "walmart") {
    if (!/(^|\.)walmart\.com$/.test(host) && host !== "walmrt.us") return null;
    const m = u.pathname.match(/\/ip\/(?:[^/]+\/)?(\d{5,})/);
    return { url: `https://${host}${u.pathname}`, itemId: m ? m[1] : null };
  }
  if (!/(^|\.)samsclub\.com$/.test(host)) return null;
  const m = u.pathname.match(/\/(?:p|ip)\/(?:[^/]+\/)?((?:prod)?\d{5,})/i);
  return { url: `https://${host}${u.pathname}`, itemId: m ? m[1] : null };
}

/**
 * Walmart's add-to-cart link: one tap puts every remembered product in the signed-in cart.
 * Returns null when no item has a Walmart item id yet.
 */
export function walmartCartUrl(items: { itemId: string; quantity: number }[]): string | null {
  const valid = items.filter((i) => /^\d{5,}$/.test(i.itemId));
  if (!valid.length) return null;
  const list = valid.map((i) => `${i.itemId}|${Math.max(1, Math.round(i.quantity))}`).join(",");
  return `https://affil.walmart.com/cart/addToCart?items=${encodeURIComponent(list)}`;
}

/** How many packages a buy text asks for: "2 × 15 oz can" → 2, "3 limes" → 3, "16 oz tub" → 1. */
export function packageCount(buyText: string | null): number {
  if (!buyText) return 1;
  return buyText.split(" + ").reduce((n, part) => {
    const times = part.match(/^(\d+)\s*×/);
    if (times) return n + Number(times[1]);
    // "2 limes", "3 bunches": a count of single items, not a size like "3 lb bag" or "2 dozen".
    const pieces = part.match(/^(\d+) (?!(?:lb|oz|fl|gal|gallon|quart|pint|ct|count|pack|dozen|l|ml|g|kg)\b)[a-z]/i);
    return n + (pieces ? Number(pieces[1]) : 1);
  }, 0);
}
