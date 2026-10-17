// Sends one test notification to the posted subscription right away. POST {subscription}.
import type { NextRequest } from "next/server";
import { json, parseSubscription, PUSH_NOT_SET_UP, pushEnv, sendPush } from "@/lib/webpush";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const env = pushEnv();
  if (!env) return json({ error: PUSH_NOT_SET_UP }, 503);
  const b: unknown = await req.json().catch(() => null);
  const sub = parseSubscription((b as { subscription?: unknown } | null)?.subscription);
  if (!sub) return json({ error: "Invalid push subscription." }, 400);
  try {
    const r = await sendPush(
      sub,
      { title: "Fast & Move", body: "Test reminder: background reminders work.", tag: "fast-test", url: "/fast" },
      env.vapid,
      300,
    );
    if (r.gone) return json({ error: "This device's subscription expired. Turn reminders off and on again.", gone: true }, 410);
    if (r.status < 200 || r.status >= 300) return json({ error: `The push service refused it (${r.status}).` }, 502);
  } catch {
    return json({ error: "The push service didn't answer. Try again." }, 502);
  }
  return json({ ok: true });
}
