// USDA FoodData Central search. The API key stays on the server (process.env.USDA_API_KEY) and is
// never sent to the browser; the response is a short normalized list.
import type { NextRequest } from "next/server";
import { cleanQuery, normalizeUsda, USDA_MISSING_KEY } from "@/lib/off";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export async function GET(req: NextRequest) {
  const q = cleanQuery(req.nextUrl.searchParams.get("q"));
  if (!q) return json({ error: "Search with 2–80 characters." }, 400);
  const key = process.env.USDA_API_KEY;
  if (!key) return json({ error: USDA_MISSING_KEY }, 503);
  let res: Response;
  try {
    res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: q, pageSize: 15, dataType: ["Foundation", "SR Legacy", "Branded"] }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return json({ error: "USDA didn't answer. Try again." }, 502);
  }
  // Don't echo USDA's body: error pages can include the request URL, and with it the key.
  if (res.status === 401 || res.status === 403) return json({ error: "USDA rejected the API key." }, 502);
  if (res.status === 429) return json({ error: "USDA rate limit reached. Try again later." }, 429);
  if (!res.ok) return json({ error: `USDA error (${res.status}).` }, 502);
  return json({ foods: normalizeUsda(await res.json().catch(() => null)) });
}
