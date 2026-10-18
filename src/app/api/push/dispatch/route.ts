// Sends due reminders. Called every minute by Supabase pg_cron + pg_net (supabase/push.sql) or any
// external cron, with `Authorization: Bearer ${PUSH_CRON_SECRET}`.
// 1. Picks up to 50 unsent, due jobs that no other run holds, and claims them atomically
//    (PATCH claimed_at where it is still null or older than CLAIM_MS), so overlapping runs never
//    send the same job twice. Only the rows that PATCH returns are sent.
// 2. Sends them all in parallel, each with an 8 s timeout, under an overall deadline well inside
//    maxDuration, so one black-holed endpoint can't stall the rest.
// 3. Records every outcome in a few batched updates: sent / given up → sent_at; transient failure →
//    attempts + 1 and the claim released for a retry next minute (at most MAX_ATTEMPTS, and only
//    while the job is under RETRY_MS late). Subscriptions the push service says are gone, or whose
//    stored keys are invalid, are deleted (their jobs go with them).
import type { NextRequest } from "next/server";
import {
  bearerOk,
  eq,
  json,
  parseSubscription,
  pg,
  PUSH_NOT_SET_UP,
  PUSH_TIMEOUT_MS,
  pushEnv,
  pushSetupProblem,
  sendPush,
  type PushEnv,
} from "@/lib/webpush";

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
  attempts: number;
  push_subscriptions: { p256dh: string; auth: string } | null;
}

/** A reminder this late is no longer useful (e.g. the project was paused): drop it unsent. */
const STALE_MS = 60 * 60_000;
/** Transient failures (429, 5xx, network, timeout) are retried next minute until a job is this late… */
const RETRY_MS = 15 * 60_000;
/** …or has been tried this many times. */
const MAX_ATTEMPTS = 3;
/** A claim older than this belongs to a run that died; the job may be picked up again. */
const CLAIM_MS = 2 * 60_000;
/** All sends are aborted this long after the run started. Worst case before sending: two 8 s
 *  Supabase calls; after: two rounds of 8 s writes. 30 + 16 < maxDuration (60 s). */
const SEND_DEADLINE_MS = 30_000;
const BATCH = 50;

const SELECT = "id,endpoint,kind,send_at,title,body,tag,url,attempts,push_subscriptions(p256dh,auth)";

type Outcome = "sent" | "skipped" | "failed" | "retry" | "gone";

/** After this attempt fails, give up (mark it done) instead of retrying. */
function isLastTry(j: DueJob, now: number): boolean {
  return j.attempts + 1 >= MAX_ATTEMPTS || now - Date.parse(j.send_at) >= RETRY_MS;
}

async function claimDueJobs(env: PushEnv, now: number): Promise<DueJob[]> {
  const nowIso = encodeURIComponent(new Date(now).toISOString());
  const unclaimed = `or=(claimed_at.is.null,claimed_at.lt.${encodeURIComponent(new Date(now - CLAIM_MS).toISOString())})`;
  const due = `sent_at=is.null&send_at=lte.${nowIso}&${unclaimed}`;
  const candidates = await pg<{ id: number }[]>(env, `push_jobs?select=id&${due}&order=send_at.asc&limit=${BATCH}`);
  if (!candidates.length) return [];
  // One UPDATE … WHERE: a concurrent run that claimed a row first makes this one skip it.
  return pg<DueJob[]>(env, `push_jobs?select=${SELECT}&id=in.(${candidates.map((c) => c.id).join(",")})&${due}`, {
    method: "PATCH",
    body: { claimed_at: new Date(now).toISOString() },
    prefer: "return=representation",
  });
}

/**
 * Each promise's result, or undefined for any still pending after `ms`. Normally everything has
 * settled long before (each send has its own timeout and the deadline aborts the rest); the timer
 * is a backstop so nothing can hold the run past the deadline.
 */
async function settleWithin<T>(promises: Promise<T>[], ms: number): Promise<(PromiseSettledResult<T> | undefined)[]> {
  const results: (PromiseSettledResult<T> | undefined)[] = promises.map(() => undefined);
  const all = Promise.allSettled(promises).then((r) => r.forEach((x, i) => (results[i] = x)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const backstop = new Promise<void>((resolve) => (timer = setTimeout(resolve, Math.max(0, ms))));
  await Promise.race([all, backstop]);
  clearTimeout(timer);
  return results;
}

async function handle(req: NextRequest): Promise<Response> {
  const start = Date.now();
  const secret = process.env.PUSH_CRON_SECRET;
  if (!secret) return json({ error: PUSH_NOT_SET_UP }, 503);
  if (!bearerOk(req.headers.get("authorization"), secret)) return json({ error: "Unauthorized" }, 401);
  const env = pushEnv();
  // The caller is the operator's cron, so it may see exactly what is missing (net._http_response).
  if (!env) return json({ error: pushSetupProblem() ?? PUSH_NOT_SET_UP }, 503);

  let jobs: DueJob[];
  try {
    jobs = await claimDueJobs(env, start);
  } catch {
    return json({ error: "Couldn't read jobs." }, 502);
  }

  const deadline = new AbortController();
  const remaining = start + SEND_DEADLINE_MS - Date.now();
  const deadlineTimer = setTimeout(() => deadline.abort(), Math.max(0, remaining));

  const outcomes = await settleWithin(
    jobs.map(async (j): Promise<Outcome> => {
      const late = start - Date.parse(j.send_at);
      if (!j.push_subscriptions || late > STALE_MS) return "skipped";
      const sub = parseSubscription({ endpoint: j.endpoint, keys: j.push_subscriptions });
      if (!sub) return "gone"; // stored before validation was tightened; encrypt() would throw on it
      const lastTry = isLastTry(j, start);
      try {
        const r = await sendPush(
          sub,
          { title: j.title, body: j.body, tag: j.tag, url: j.url },
          env.vapid,
          // "Window closes in 30 min" is useless after 30 min; the others can wait an hour.
          j.kind === "window" ? 1800 : 3600,
          fetch,
          { timeoutMs: PUSH_TIMEOUT_MS, signal: deadline.signal },
        );
        if (r.gone) return "gone";
        if (r.status >= 200 && r.status < 300) return "sent";
        if ((r.status === 429 || r.status >= 500) && !lastTry) return "retry";
        return "failed";
      } catch {
        return lastTry ? "failed" : "retry";
      }
    }),
    remaining + 1000,
  );
  clearTimeout(deadlineTimer);

  const goneEndpoints = new Set<string>();
  outcomes.forEach((o, i) => o?.status === "fulfilled" && o.value === "gone" && goneEndpoints.add(jobs[i].endpoint));
  const done: number[] = [];
  /** Jobs to try again, keyed by their new attempts count and whether to release the claim. */
  const retry = new Map<string, number[]>();
  const counts = { sent: 0, skipped: 0, failed: 0, retry: 0 };
  jobs.forEach((j, i) => {
    if (goneEndpoints.has(j.endpoint)) return; // deleted with the subscription
    const o = outcomes[i];
    let outcome: Outcome;
    if (o?.status === "fulfilled") outcome = o.value;
    else outcome = isLastTry(j, start) ? "failed" : "retry";
    if (outcome === "gone") return; // unreachable: gone endpoints are handled above
    counts[outcome]++;
    if (outcome !== "retry") {
      done.push(j.id);
      return;
    }
    // A send that never settled might still be in flight: keep its claim so no other run re-sends
    // it before the claim expires (CLAIM_MS). Settled failures are released for next minute.
    const key = `${j.attempts + 1}:${o ? "release" : "keep"}`;
    retry.set(key, [...(retry.get(key) ?? []), j.id]);
  });

  const nowIso = new Date().toISOString();
  const writes: Promise<unknown>[] = [];
  if (done.length) {
    writes.push(pg(env, `push_jobs?id=in.(${done.join(",")})`, { method: "PATCH", body: { sent_at: nowIso }, prefer: "return=minimal" }));
  }
  for (const [key, ids] of retry) {
    const [attempts, claim] = key.split(":");
    writes.push(
      pg(env, `push_jobs?id=in.(${ids.join(",")})`, {
        method: "PATCH",
        body: { attempts: Number(attempts), ...(claim === "release" ? { claimed_at: null } : {}) },
        prefer: "return=minimal",
      }),
    );
  }
  for (const endpoint of goneEndpoints) {
    writes.push(pg(env, `push_subscriptions?endpoint=${eq(endpoint)}`, { method: "DELETE", prefer: "return=minimal" }));
  }
  const written = await Promise.allSettled(writes);
  if (written.some((w) => w.status === "rejected")) {
    // Unrecorded jobs stay claimed and are picked up again once the claim expires.
    return json({ error: "Sent, but couldn't update jobs.", sent: counts.sent }, 502);
  }

  // Housekeeping: forget sent jobs after a week. Best effort.
  const weekAgo = new Date(start - 7 * 86_400_000).toISOString();
  await pg(env, `push_jobs?sent_at=lt.${encodeURIComponent(weekAgo)}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => undefined);

  return json({
    due: jobs.length,
    sent: counts.sent,
    skipped: counts.skipped,
    failed: counts.failed,
    retry: counts.retry,
    gone: goneEndpoints.size,
  });
}

export const GET = handle;
export const POST = handle;
