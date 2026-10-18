# Background reminders (web push)

Fasting reminders (halfway, target reached, eating window closes in 30 min) normally come from the app while it is open (`src/client/reminders.tsx`). Web push gets the same reminders to the phone when the app is closed. It is optional: with nothing set up, the in-app reminders keep working and Settings says "Push isn't set up".

**Where it works:** Android (Chrome and others), desktop browsers, and iPhone/iPad on **iOS 16.4 or later, only when the app is added to the Home Screen** and opened from there. A Safari tab can't receive push.

## How it works without an always-on server

```
phone (PushSync)  ── POST /api/push/subscribe {subscription, jobs} ──▶  Supabase push_jobs
Supabase pg_cron (every minute, only if a job is due) ── pg_net ──▶  /api/push/dispatch
/api/push/dispatch  ── encrypted push (VAPID) ──▶  Apple / Google / Mozilla push service ──▶ phone
```

1. When a fast starts, is edited or ends, or the notification toggles change, the phone works out its upcoming reminder times (halfway = start + target/2, target = start + target, window closing = end + eating window − 30 min) and posts them with its push subscription. The server replaces whatever was pending for that device, so the stored schedule always matches the phone. Only reminders in the next 7 days are sent, at most 10.
2. Every minute, `pg_cron` checks for due jobs and, if there are any, calls `/api/push/dispatch` with the cron secret. That route (a Vercel function):
   - **claims** up to 50 due, unsent jobs in one `UPDATE … WHERE claimed_at is null or claimed_at < now() − 2 min` (PostgREST `PATCH` with `Prefer: return=representation`) and sends only the rows that update returned, so two overlapping runs (a slow run plus the next minute's cron, or `pg_cron` plus an external cron) never send the same job twice;
   - sends them **in parallel**, each with an 8 s timeout, and aborts anything still open 30 s after the run started, so a black-holed endpoint can't hold up the other jobs or push the run past its 60 s limit;
   - records every outcome in a few batched updates: delivered, rejected or given up → `sent_at`; transient failure (429, 5xx, network, timeout) → `attempts + 1` and the claim released so the next minute retries it. A job is given up after **3 attempts** or once it is 15 minutes late. Subscriptions the push service says are gone (404/410), or whose stored keys are invalid, are deleted with their jobs.
   If a run dies part-way, its claimed jobs are picked up again after the 2-minute claim expires.
3. The service worker (`src/app/sw.ts`) shows the notification; tapping it opens or focuses the app on `/fast`.

Vercel Hobby cron jobs only run once a day, so they can't drive this. Any free external cron that can send a header works instead of `pg_cron`, e.g. [cron-job.org](https://cron-job.org): call `https://YOUR-APP.vercel.app/api/push/dispatch` every minute (GET or POST) with the header `Authorization: Bearer <PUSH_CRON_SECRET>`.

Push notifications carry the tag `fast-<fastId>-<kind>` and the in-app system notification uses `fast`. The in-app one is only shown as a system notification when the app is in the background, and while the app is visible it is just a toast, so doubles are rare. Late jobs are retried (up to 3 attempts, within 15 minutes) on push-service errors, and jobs over an hour late (for example after the Supabase project was paused) are dropped rather than sent.

## Setup (once)

1. **Generate VAPID keys** (raw base64url: public is the 65-byte uncompressed P-256 point, private the 32-byte scalar):

   ```sh
   node -e "const e=require('crypto').createECDH('prime256v1');e.generateKeys();const d=e.getPrivateKey();console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY='+e.getPublicKey('base64url'));console.log('VAPID_PRIVATE_KEY='+Buffer.concat([Buffer.alloc(32-d.length),d]).toString('base64url'))"
   ```

   (`generateVapidKeys()` in `src/lib/webpush.ts` does the same.) Keep the private key secret. Changing the keys later means every device has to turn background reminders off and on again.

2. **Make a cron secret**, any long random string:

   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

3. **Supabase** (the free plan is enough). If you don't have a project yet, create one. In the SQL editor, open `supabase/push.sql`, replace `https://YOUR-APP.vercel.app` with your app's URL and `YOUR_PUSH_CRON_SECRET` with the secret from step 2, and run it (it is safe to re-run, and **must be re-run after updating the app** from a version without the `claimed_at`/`attempts` columns, otherwise dispatch answers 502 "Couldn't read jobs."). It creates `push_subscriptions` and `push_jobs` (RLS on with no policies, so only the service-role key can read or write them) and schedules the every-minute dispatch. The `pg_cron` and `pg_net` extensions can also be switched on under Database → Extensions if the `create extension` lines are refused.

4. **Vercel → Project → Settings → Environment Variables** (Production), then redeploy:

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | public key from step 1 |
   | `VAPID_PRIVATE_KEY` | private key from step 1 |
   | `VAPID_SUBJECT` | `mailto:you@example.com` or an `https:` URL (how a push service can contact you). Must start with `mailto:` or `https:`: Apple rejects anything else, so any other value counts as not set up |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` (shared with sync) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key. Server only, never `NEXT_PUBLIC_` |
   | `PUSH_CRON_SECRET` | secret from step 2 |

   If any of the first five is missing, or `VAPID_SUBJECT` doesn't start with `mailto:`/`https:`, every `/api/push/*` route answers 503 `{"error":"Push isn't set up"}`; a bad subject is also logged once (`[push] Push isn't set up: VAPID_SUBJECT must start with "mailto:" …`). Dispatch also needs `PUSH_CRON_SECRET`, and once the cron's secret checks out its 503 names exactly what is wrong (visible in `net._http_response`).

5. **On the phone:** iPhone: Safari → Share → Add to Home Screen, open the app from the Home Screen. Then Settings → Background reminders → Turn on, allow notifications, and tap **Send test**.

## Things to know

- **Free Supabase projects pause after a week without activity.** While paused, the cron doesn't run and reminders stop until you resume the project in the Supabase dashboard. Stale reminders are not sent in a burst afterwards. In-app reminders are unaffected.
- The schedule is set when the phone last had the app open and online. Starting a fast while offline schedules its reminders the next time the app is online.
- Turning reminders off unsubscribes the device and deletes its row (and pending jobs) on the server.
- Checking the cron: `select * from cron.job_run_details order by start_time desc limit 20;` and `select * from net._http_response order by created desc limit 20;`.

## Code

| File | Role |
| --- | --- |
| `src/lib/webpush.ts` | VAPID JWT, aes128gcm encryption, `sendPush` (8 s timeout, optional abort signal), input validation (push-service host on the default port with no userinfo, p256dh a real P-256 point, 16-byte auth), env check, PostgREST helper (tests in `webpush.test.ts`, including the RFC 8291 example and the dispatch route) |
| `src/app/api/push/vapid` | `GET` → `{publicKey}` or 503 |
| `src/app/api/push/subscribe` | `POST {subscription, jobs}` replaces the device's pending jobs; `DELETE {endpoint}` forgets the device |
| `src/app/api/push/dispatch` | claims and sends due jobs in parallel, records outcomes (cron, bearer secret) |
| `src/app/api/push/test` | `POST {subscription}` sends one test notification |
| `src/client/push.ts` | `pushState`, `enablePush`, `disablePush`, `sendTestPush`, `reminderJobs`, `syncFastReminders`, `<PushSync />` |
| `src/ui/PushSettings.tsx` | the Settings card |
| `supabase/push.sql` | tables (`push_jobs.claimed_at`, `attempts`), RLS, cron |
