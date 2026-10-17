// Stores a device's push subscription and its reminder schedule.
// POST {subscription, jobs[]}: upserts the subscription and replaces every pending (unsent) job for
// that endpoint with `jobs` (the device always sends its whole schedule, so an empty list clears it).
// DELETE {endpoint}: forgets the subscription and its jobs.
import type { NextRequest } from "next/server";
import { eq, jobTag, json, parseJobs, parseSubscription, pg, PUSH_NOT_SET_UP, pushEnv } from "@/lib/webpush";

export const dynamic = "force-dynamic";

async function body(req: NextRequest): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get("content-length") ?? 0) > 16_384) return null;
  const v: unknown = await req.json().catch(() => null);
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export async function POST(req: NextRequest) {
  const env = pushEnv();
  if (!env) return json({ error: PUSH_NOT_SET_UP }, 503);
  const b = await body(req);
  const sub = parseSubscription(b?.subscription);
  if (!sub) return json({ error: "Invalid push subscription." }, 400);
  const jobs = parseJobs(b?.jobs);
  if (!jobs) return json({ error: "Invalid reminders (at most 10, within 7 days, text ≤ 120 characters)." }, 400);

  try {
    const now = new Date().toISOString();
    await pg(env, "push_subscriptions?on_conflict=endpoint", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, updated_at: now },
    });
    await pg(env, `push_jobs?endpoint=${eq(sub.endpoint)}&sent_at=is.null`, { method: "DELETE", prefer: "return=minimal" });
    if (jobs.length) {
      await pg(env, "push_jobs", {
        method: "POST",
        prefer: "return=minimal",
        body: jobs.map((j) => ({
          endpoint: sub.endpoint,
          fast_id: j.fastId,
          kind: j.kind,
          send_at: j.sendAt,
          title: j.title,
          body: j.body,
          tag: jobTag(j.fastId, j.kind),
          url: "/fast",
        })),
      });
    }
  } catch {
    return json({ error: "Couldn't save reminders. Try again." }, 502);
  }
  return json({ ok: true, scheduled: jobs.length });
}

export async function DELETE(req: NextRequest) {
  const env = pushEnv();
  if (!env) return json({ error: PUSH_NOT_SET_UP }, 503);
  const b = await body(req);
  const endpoint = typeof b?.endpoint === "string" && b.endpoint.length <= 1024 ? b.endpoint : null;
  if (!endpoint) return json({ error: "Missing endpoint." }, 400);
  try {
    await pg(env, `push_subscriptions?endpoint=${eq(endpoint)}`, { method: "DELETE", prefer: "return=minimal" });
  } catch {
    return json({ error: "Couldn't remove the subscription." }, 502);
  }
  return json({ ok: true });
}
