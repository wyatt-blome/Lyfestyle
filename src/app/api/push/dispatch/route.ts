// Sends due reminders. Called every minute by Supabase pg_cron + pg_net (supabase/push.sql) or any
// external cron, with `Authorization: Bearer ${PUSH_CRON_SECRET}`.
// Picks up to 50 unsent jobs with send_at <= now, sends each, marks it sent, and deletes
// subscriptions the push service says are gone (their jobs go with them).
import type { NextRequest } from "next/server";
import { bearerOk, eq, json, pg, PUSH_NOT_SET_UP, pushEnv, sendPush } from "@/lib/webpush";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface DueJob {
  id: number;
  endpoint: string;
  kind: string;
  send_at: string;
  title: string;
  body: string;
  tag: string;
  url: string;
  push_subscriptions: { p256dh: string; auth: string } | null;
}

/** A reminder this late is no longer useful (e.g. the project was paused): drop it unsent. */
const STALE_MS = 60 * 60_000;
/** Transient failures (429, 5xx, network) are retried next minute until a job is this late. */
const RETRY_MS = 15 * 60_000;

async function handle(req: NextRequest): Promise<Response> {
  const env = pushEnv();
  const secret = process.env.PUSH_CRON_SECRET;
  if (!env || !secret) return json({ error: PUSH_NOT_SET_UP }, 503);
  if (!bearerOk(req.headers.get("authorization"), secret)) return json({ error: "Unauthorized" }, 401);

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  let jobs: DueJob[];
  try {
    jobs = await pg<DueJob[]>(
      env,
      `push_jobs?select=id,endpoint,kind,send_at,title,body,tag,url,push_subscriptions(p256dh,auth)` +
        `&sent_at=is.null&send_at=lte.${encodeURIComponent(nowIso)}&order=send_at.asc&limit=50`,
    );
  } catch {
    return json({ error: "Couldn't read jobs." }, 502);
  }

  const done: number[] = [];
  const gone = new Set<string>();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const j of jobs) {
    const late = now - Date.parse(j.send_at);
    if (gone.has(j.endpoint)) continue;
    if (!j.push_subscriptions || late > STALE_MS) {
      done.push(j.id);
      skipped++;
      continue;
    }
    try {
      const r = await sendPush(
        { endpoint: j.endpoint, keys: j.push_subscriptions },
        { title: j.title, body: j.body, tag: j.tag, url: j.url },
        env.vapid,
        // "Window closes in 30 min" is useless after 30 min; the others can wait an hour.
        j.kind === "window" ? 1800 : 3600,
      );
      if (r.gone) gone.add(j.endpoint);
      else if (r.status >= 200 && r.status < 300) {
        done.push(j.id);
        sent++;
      } else if ((r.status === 429 || r.status >= 500) && late < RETRY_MS) failed++;
      else {
        done.push(j.id);
        failed++;
      }
    } catch {
      if (late >= RETRY_MS) done.push(j.id);
      failed++;
    }
  }

  try {
    if (done.length) {
      await pg(env, `push_jobs?id=in.(${done.join(",")})`, { method: "PATCH", body: { sent_at: nowIso }, prefer: "return=minimal" });
    }
    for (const endpoint of gone) {
      await pg(env, `push_subscriptions?endpoint=${eq(endpoint)}`, { method: "DELETE", prefer: "return=minimal" });
    }
    // Housekeeping: forget sent jobs after a week.
    const weekAgo = new Date(now - 7 * 86_400_000).toISOString();
    await pg(env, `push_jobs?sent_at=lt.${encodeURIComponent(weekAgo)}`, { method: "DELETE", prefer: "return=minimal" });
  } catch {
    return json({ error: "Sent, but couldn't update jobs.", sent }, 502);
  }

  return json({ due: jobs.length, sent, skipped, failed, gone: gone.size });
}

export const GET = handle;
export const POST = handle;
