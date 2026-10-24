import "server-only";
import { createSign } from "node:crypto";

// Walmart's affiliate product search (walmart.io, free to sign up). With it the app can find the
// Walmart item for each grocery line, so the whole order goes into the cart with one tap.
// Needs WALMART_CONSUMER_ID, WALMART_PRIVATE_KEY (PEM) and WALMART_KEY_VERSION.

const SEARCH_URL = "https://developer.api.walmart.com/api-proxy/service/affil/product/v2/search";

export function walmartLookupAvailable(): boolean {
  return Boolean(process.env.WALMART_CONSUMER_ID && process.env.WALMART_PRIVATE_KEY);
}

/** The signed headers walmart.io requires on every request. */
export function walmartHeaders(consumerId: string, privateKeyPem: string, keyVersion: string, timestamp = Date.now()): Record<string, string> {
  const ts = String(timestamp);
  const signer = createSign("RSA-SHA256");
  signer.update(`${consumerId}\n${ts}\n${keyVersion}\n`);
  return {
    "WM_CONSUMER.ID": consumerId,
    "WM_CONSUMER.INTIMESTAMP": ts,
    "WM_SEC.KEY_VERSION": keyVersion,
    "WM_SEC.AUTH_SIGNATURE": signer.sign(privateKeyPem, "base64"),
    accept: "application/json",
  };
}

export interface WalmartItem {
  itemId: string;
  name: string;
  price: number | null;
}

interface SearchResponse {
  items?: { itemId?: number | string; name?: string; salePrice?: number; stock?: string; availableOnline?: boolean }[];
}

/** Pick the item to buy from search results: the first one in stock. */
export function pickItem(res: SearchResponse): WalmartItem | null {
  for (const it of res.items ?? []) {
    if (!it.itemId || !it.name) continue;
    if (it.stock && /not available|out of stock/i.test(it.stock)) continue;
    return { itemId: String(it.itemId), name: it.name, price: typeof it.salePrice === "number" ? it.salePrice : null };
  }
  return null;
}

export class WalmartError extends Error {}

export async function searchWalmart(query: string): Promise<WalmartItem | null> {
  const consumerId = process.env.WALMART_CONSUMER_ID;
  // Keys pasted into a hosting dashboard often lose their line breaks; put them back.
  const key = process.env.WALMART_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!consumerId || !key) throw new WalmartError("Walmart product lookup isn't set up.");
  const url = `${SEARCH_URL}?${new URLSearchParams({ query, numItems: "5" })}`;
  const res = await fetch(url, {
    headers: walmartHeaders(consumerId, key, process.env.WALMART_KEY_VERSION ?? "1"),
    signal: AbortSignal.timeout(10000),
  }).catch(() => {
    throw new WalmartError("Couldn't reach Walmart.");
  });
  if (res.status === 401 || res.status === 403) throw new WalmartError("Walmart rejected the app's keys. Check the walmart.io settings.");
  if (!res.ok) throw new WalmartError(`Walmart search failed (${res.status}).`);
  return pickItem((await res.json()) as SearchResponse);
}
