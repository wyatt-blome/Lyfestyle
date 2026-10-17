// Barcode lookup through Open Food Facts. Proxied so the app can send OFF's requested User-Agent
// and get back one small normalized shape. Nothing is stored server-side.
import { isValidBarcode, normalizeOff, OFF_FIELDS, OFF_USER_AGENT } from "@/lib/off";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function GET(_req: Request, { params }: { params: Promise<{ barcode: string }> }) {
  const { barcode } = await params;
  if (!isValidBarcode(barcode)) return json({ error: "Barcode should be 6–14 digits." }, 400);
  const url = `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${OFF_FIELDS}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": OFF_USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return json({ error: "Open Food Facts didn't answer. Try again." }, 502);
  }
  // OFF answers 404 with {status: 0} for unknown barcodes.
  if (res.status === 404) return json({ error: "Not found in Open Food Facts." }, 404);
  if (!res.ok) return json({ error: `Open Food Facts error (${res.status}).` }, 502);
  const product = normalizeOff(await res.json().catch(() => null));
  if (!product) return json({ error: "Not found in Open Food Facts." }, 404);
  return json(product);
}
