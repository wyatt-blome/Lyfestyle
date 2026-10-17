# Decisions

Short records of the judgment calls behind Fast & Move, newest last. Each says what was decided and why. When in doubt, the rule is: fewer decisions for Wyatt mid-workout.

## D1. The build prompt is the specification; Portion's light process
The build prompt (Parts 1–8) is the source of truth. Work follows the process used in the Portion repository: a `Start the repository` commit on `main`, the build on a `claude/lyfestyle-build` branch, a pull request per body of work, CI running typecheck, lint, tests and build, and this decision log.

## D2. Layout: `src/` with `lib/` for pure logic
Pure, tested logic lives in `src/lib` (fasting, rotation, time, backup, why-card resolution); device code that touches IndexedDB is in `src/client`; Dexie schema in `src/db`; screens and components in `src/ui`; Next routes in `src/app` are one-line wrappers around a screen. Seeds are in `src/seed`.

## D3. Every screen is a static page rendered on the device
No server data, so every route prerenders as static HTML and reads IndexedDB in the browser. The service worker precaches every route listed in `src/ui/routes.ts`, so the whole app opens offline after the first visit. The only server route planned is the USDA proxy (Phase 3).

## D4. Seed content ships in the bundle, not in IndexedDB
Exercises, sessions, episodes and why-cards are imported from `src/seed` rather than copied into Dexie. They are versioned with the app, can't drift from the code, need no migration, and stay out of backups. IndexedDB holds only personal records (fasts, intake, logs, progression, metrics, readiness, insights, episode notes, settings, timer state).

## D5. Serwist via `@serwist/turbopack`
Next 16 builds with Turbopack, so the service worker is bundled by `@serwist/turbopack` (a route at `/serwist/sw.js` with `Service-Worker-Allowed: /`). It is disabled in `next dev`; test offline with `npm run build && npm start`. Demo GIFs and images from ExerciseDB and wger are runtime-cached cache-first for a year.

## D6. Fast status: completed vs broken
A fast that reaches its target is `completed`; one ended before the target is `broken`. Only completed fasts count toward streaks. A streak counts consecutive local days (the day the fast ended) and still shows in the morning before today's fast ends.

## D7. The 24-hour rules
- **Doctor note:** required when the target is over 24 h (36 h, 48 h, custom over 24). A plain 24 h fast does not need it.
- **Training restriction:** applies when an active fast is past 24 h elapsed, or was started with a target over 24 h. That covers the whole of a planned extended fast. Train then shows only M, Z and Daily 10; Home swaps the planned session for M with a note.
- **Extended warning** (electrolytes, stop if dizzy/faint/palpitations, break gently with protein) shows for targets of 36 h and up when picking the fast, and for any running fast over 24 h.

## D8. Custom fasts borrow the nearest protocol's why-card
A custom fast shows the card for the closest protocol: ≥ 36 h → extended, ≥ 24 h → 24 h, ≥ 23 h → OMAD, ≥ 17 h → 18:6, otherwise 16:8.

## D9. Anything with calories breaks the fast
An entry breaks the fast if it is marked as such or has kcal > 0. Meals and snacks default to breaking; drinks and supplements default to fast-safe. Logging a breaking item at or after the fast's start asks "End fast at <time>?" (time editable) and shows the protein card; ending opens the check-in.

## D10. Rotation start = the day the app is first opened
Weeks count from the Monday of that week, so week 1 lines up with the Monday-to-Sunday plan. The missed-Wednesday rule (a missed 4×4 moves to Saturday in place of Z) only applies to Wednesdays on or after the start date, so opening the app for the first time on a Saturday doesn't report a missed 4×4. You can change the start date in Settings. Friday's Quick 20 follows the cycle week (Q1 in week 1 … Q6, the deload Q, in week 6). Saturday's alternative is the next Q in the cycle.

## D11. In-app reminders only (MVP)
Halfway, target and "eating window closes in 30 min" are checked every 30 s while the app is open and when it returns to the foreground. Each fires once per fast. When the app is in the background they also show a system notification, if permission was granted. Web push comes in Phase 4.

## D12. Backup
Export writes every personal table to `fast-and-move-backup-YYYY-MM-DD.json`. Import replaces everything on the device, after a confirmation. Home shows a reminder when there has been no backup for 7 days (counted from the first fast if there has never been one).

## D13. Dark only for now
The spec asks for dark by default, and a theme switch is one more setting to think about, so the app is dark only.

## D14. Seed transcription choices
- The 43 listed exercises, plus `zone2-walk` (session Z) and `breathing-reset` (the Quick 20 downshift), which the sessions need.
- A template maps each exercise to one swap. The 4×4's other modes (Bell & Step, outdoor chores) are described in its item note, and the hill exercise's swap list still offers bike and Bell & Step.
- Q1 minute 2 is one item (`kb-press`, note "clean + press"), so each EMOM minute stays one move.
- **The why-core "ACE McGill Big Three article" link points to acefitness.org's home page.** The prompt didn't include the article URL and we don't invent one. Paste the real URL into `src/seed/whyCards.json` when you have it.

## D15. Interval engine: segments plus timestamps
`src/lib/timer.ts` flattens a session into segments (prep, work, rest, downshift, warm-up, cool-down). A run stores only its start time, its pauses, the active-time offsets where Next was tapped, its end time, and the counters. Every number on screen is computed from those and the clock, so a reload, a locked phone or two minutes in another app never throws the timer off. The run is kept in IndexedDB (`kv` key `run:active`), and Train offers "Resume". After a long gap, only the latest segment change beeps; missed countdown ticks are not replayed.

## D16. How each format maps to the engine
- **EMOM:** one slot per minute, cycling through the moves.
- **AMRAP / LADDER:** one timed block with a +1 counter (rounds or top rung).
- **TABATA:** 20/10 × 8 per block. A final block with spare moves alternates them (Q5: push-up / dead bug).
- **INTERVAL:** either fixed slots (Q6: 10 swings every 30 s) or work/rest pairs (4×4). The last 4×4 recovery runs into the cool-down.
- **ROUNDS:** an open-ended work segment (tap Next), then the rest.
- **Between blocks:** a 60 s rest goes between two timed work blocks (Q6: swings → get-ups).
- **Follow-alongs (M, Daily 10, Z):** holds count down per side and move on by themselves; rep moves wait for Next.

## D17. Progression
Staged ladders (swing, get-up, press, goblet squat, suitcase carry, Big 3, 4×4) move up a stage after two qualifying sessions in a row: every planned set done, and no set (or session) RPE above 7. The 4×4 qualifies on finishing every interval, since it is hard by design. Other moves with a rep range use double progression: the top of the range in every set at RPE ≤ 7, twice in a row, moves to the next heavier weight in your gear at the bottom of the range. Deload sessions, early-ended runs and Quick 20s don't move stages; Quick 20s show the "+1 rep or bigger bell" hint when the score rises two sessions in a row. Follow-alongs only move the Big 3, so an optional carry on a walk doesn't advance the carry. The swing at Stage 2+ is shown as the one-hand swing everywhere it appears in A and B; the Quick 20 templates keep their own swing.

## D18. No-decision defaults
- **Swaps** are remembered per session (`kv` key `swaps:<id>`).
- **Easy Day** defaults to M, or to Z when today already is M.
- **The Quick 20 picker** defaults to the Q after the last one you did, else the cycle week's. Q5 is skipped on deloads. Every Quick 20 is off during a fast past 24 h, and Train points to M, Z or the Daily 10 instead.
- **Deload** turns on by itself in week 6, when readiness is ≤ 2, or after a ≥ 36 h fast in the last two days. There is a one-tap box for illness or short sleep, because sleep hours aren't logged.

## D19. Logger
Rows are built from the plan locked in at the start (swaps and stages included), and pre-filled from the last session of the same template for the same exercise and set number. When the plan's load went up, the plan wins. Rest timers:
- S&S swings "every 30 s": 20 s.
- Get-ups "each minute": 40 s.
- Supersets and circuits: the block's rest after the last move of each round.
- Straight sets: 60 s.
- Warm-ups and cool-downs: none.

Every tap updates the stored draft in one transaction, so quick taps never undo each other.

## D20. Media
`npm run build` first runs `scripts/fetch-media.mjs`, which downloads every demo to `public/media` and writes `src/seed/media-manifest.json`. Anything it can't fetch keeps its remote URL; the build never fails because of media. Today's demos are fetched ahead of time when Train or a session opens, and the service worker keeps them cache-first, so the session works offline. HTML pages are precached; the GIFs aren't, since that would be tens of MB on every update.

## D21. Dependencies: nothing over 100 kB without approval
Recharts, `@zxing/browser` and `@supabase/supabase-js` are each over 100 kB, so they weren't added. Charts are hand-built SVG, barcodes use `BarcodeDetector` with a manual-entry fallback, and sync (Phase 4) talks to Supabase's REST API with `fetch`. Each can be swapped in later if approved.

# Phase 3 (food log, progress, insights)

## P3-1. Days are bounded in the settings zone, DST-aware
The Log screen now bounds a day with `dayBounds(key, tz)` from `src/lib/food.ts` (the settings zone, falling back to the device zone) instead of the browser's local midnight. Days that change the clocks are 23 or 25 hours long, and the timeline scales to that.

## P3-2. "Copy yesterday" copies only times already passed
Each of yesterday's entries is copied to today at the same local clock time, but only when that time is at or before now. Later ones are skipped and the confirm says how many, so the button can be tapped again in the evening. Future entries aren't logged because a future entry that breaks a fast would ask to end the fast at a time that can't be saved yet. A confirm always runs first and mentions entries already logged today; nothing is de-duplicated. Of the copied entries, the first that would break the running fast goes through `useFastFlows().logTemplate` so "End fast at <time>?" appears once, at the earliest breaking time. The rest go through `logIntake`, so `fastId` and `breaksFast` are still set. The button shows only when viewing today.

## P3-3. Day timeline: anything not covered by a fast counts as eating
Fasting is the union of every non-deleted Fast's [start, end or now] clipped to the day. Everything else before now is shaded as eating, and the legend reads "No fast logged" when the day has no fasting at all. After now the bar is hatched as "future". Entry markers are filled for entries that break a fast and hollow for fast-safe ones. They are small 24 px glance targets, because the entries list below has the full-size controls.

## P3-4. Barcode: BarcodeDetector only; the @zxing/browser fallback needs approval
Scanning uses `BarcodeDetector` (EAN-13/8, UPC-A/E, ITF) and the rear camera (`facingMode: ideal environment`), trying a frame every 200 ms. Browsers without it (Firefox, older iOS) get the manual barcode field, which is always shown. **`@zxing/browser` is not added, because it is over 100 kB and needs approval.** The hook is `fallbackDetector()` in `src/ui/BarcodeScanner.tsx` (a TODO). Load it there with a dynamic `import()` so it stays out of the main bundle.

## P3-5. Food lookups go through two server routes and are never required
`/api/off/[barcode]` and `/api/usda?q=` are `force-dynamic`, send `Cache-Control: no-store`, check their input (barcode 6–14 digits, query 2–80 characters) and time out after 8 s. The USDA key stays in `process.env.USDA_API_KEY`. Without it, the route returns 503 with "Add USDA_API_KEY in Vercel to enable search." and the sheet shows that text. USDA error bodies aren't passed on, since they can echo the request URL and with it the key. Picking a result opens the normal add-entry form prefilled, so you check it before it's saved. Offline, the sheet says "Needs a connection" and offers manual entry. Credits: Open Food Facts (ODbL) on the scan result, USDA FoodData Central (public domain) under the search.

## P3-6. Nutrition normalization
- **Open Food Facts:** kcal fields first, otherwise kJ ÷ 4.184. Per-serving values come from OFF's own `_serving` fields, otherwise from per-100 g × `serving_quantity`. The first brand is used. Unknown products (`status: 0` or 404) count as not found.
- **USDA:** energy is nutrient 1008 (kcal). Foundation foods, which often lack 1008, fall back to Atwater 2047/2048. Protein is nutrient 1003. The older `nutrientNumber` values (208/957/958, 203) are accepted too. Search-result values are per 100 g.
- **Presets:** OFF uses one serving when per-serving data exists, else 100 g. USDA uses the branded serving when its unit is g or ml (values scaled to it), else 100 g.

## P3-7. Favorites: an edit mode, not long-press
Favorites sit under the quick drinks. "Edit" shows ↑ ↓ × for each one, so every action is a 48 px button and nothing depends on long-press timing with sweaty hands. Reordering renumbers `sort` from 0. ☆ on a logged entry saves its template (everything except id, times and the fast link). It shows ★ once a favorite with the same name, amount and unit exists.

## P3-8. Charts are hand-built SVG, not Recharts
`src/ui/charts` has `LineChart` and `BarChart`. Recharts is over 100 kB and not approved. Each chart has a title, a live readout (tap or hover reads the nearest point, and arrow keys step through points when the chart has focus), an `aria-label` with a one-sentence summary, and a visually hidden table of every value. There is one y-axis per chart, so weight, waist and resting HR are three charts. The 4×4 chart's two series (peak, average) also differ by dash and have a legend, so they never rely on color alone. The colors come from the theme variables. The fasting chart draws a dashed line at the default protocol's target.

## P3-9. What counts in Progress
- **Session done:** a WorkoutLog that has `endedAt`, or at least one set ticked `done`. Weeks run Monday to Sunday in the settings zone, and logs are grouped by their `date`.
- **Lift progression:** the heaviest `loadLb` per session date for the chosen exercise. The list includes every exercise with a logged load, most-logged first.
- **Quick 20:** one series per Q template. Each template plots whichever of rounds or rungs it mostly records.
- **4×4 HR:** per session, the highest interval peak and the mean of the interval averages.
- **Weekly summary:** fasts are counted in the week they ended. Hit rate is completed ÷ ended. Weight change is the last weigh-in of the week minus the last one before the week started.
- **Units:** body metrics are stored and shown in lb and inches (the field names are imperial). A metric display can come later.
- **Validation:** body metrics are range-checked against typos (weight 50–700 lb, waist 15–80 in, RHR 25–150, BP 60–260 / 30–160, both BP numbers together).

## P3-10. Readiness: one row per day, higher is always better
Sleep, soreness and energy are each 1–5, and soreness is labeled "Very sore … Fresh" so 5 is always good. `readinessScore` is the average, and `suggestsEasyDay` is a score of 2 or less, which shows "Low readiness: take an Easy Day (M, Z or Daily 10)." with the why-deload-sleep card. Saving upserts by date. The `date` index is unique, so a deleted row is revived rather than duplicated.

## P3-11. User insights stay separate from seeded content
`/why/insights` lists only `source: "user"` rows, each with a "Your note" badge, and editing can't change the source. The principle has a live counter. The field allows typing a little past 280 so the counter can show you're over, but saving is blocked above 280. A source link is required and must be http(s). Picking an episode fills the link from the episode when the link is still empty.

## P3-12. Loose ends fixed on merge
The add-entry form now keeps `source` and `barcode` from a USDA or Open Food Facts preset. The service worker sends `/api/*` network-only, so food lookups are never cached.


# Phase 4 (sync, push, polish)

## D22. Sync: one Supabase table, plain REST, last write wins
Sync is off unless `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set and you sign in with a magic link (Settings → Sync).
- **Storage:** every synced record goes in `public.records` (`supabase/schema.sql`): user, table, id, the record as JSON, `updated_at` and `deleted_at`. Row-level security limits each user to their own rows, and there is no delete policy because deletes are soft.
- **Conflicts:** a trigger keeps the newer row when an older write arrives (last write wins on the record's `updatedAt`). It stamps `synced_at` from the server clock, which is the pull cursor, with a 5 s overlap so late commits aren't missed.
- **Each run:** push the rows changed here since the last push, then pull and apply only strictly newer copies (ties keep the local one).
- **What stays local:** `kv` (timers, drafts, swaps). Tokens and cursors live in localStorage, so they never end up in a backup file and a restored backup can't carry another device's cursors.
- **When it runs:** on open, every 5 min, on returning to the app and on reconnecting. When a free project is paused, sync says how to restore it.
- **No client library:** `@supabase/supabase-js` is over 100 kB (D21), so this uses `fetch`.

## D23. Background reminders: VAPID web push with no push library
`src/lib/webpush.ts` builds the VAPID JWT (ES256) and the aes128gcm encryption with `node:crypto`. It is checked against the RFC 8291 example.
- **Scheduling:** the device posts its whole reminder schedule (halfway, target, eating window closes in 30 min) with its push subscription to `/api/push/subscribe`, which replaces that device's pending jobs in Supabase (`supabase/push.sql`).
- **Sending:** `pg_cron` checks every minute and calls `/api/push/dispatch` (bearer secret) only when a job is due. Vercel Hobby cron runs once a day, so it can't do this; any external minute cron works instead.
- **Abuse limit:** subscribe only accepts real push-service hosts. It is otherwise open, which is acceptable for a personal app: a stranger could at most push to their own browser.
- **Late or failed sends:** errors are retried for 15 min. Jobs more than an hour late (after a paused project) are dropped rather than sent in a burst.
- **iPhone:** it needs the app on the Home Screen and iOS 16.4+. Settings explains that.
- **In-app reminders** (D11) keep working either way. Notification tags differ, so a double notification is possible on Android when the app is in the background, and that's accepted.

Setup is in `docs/PUSH.md`.

## D24. Polish: accessibility and performance
- **Accessibility:** Lighthouse scores 100 on every screen tested. Tap targets are ≥ 48 px, timers have `role="timer"`, toasts are `aria-live`, scales and choices use `aria-pressed`/`radio`, charts have text alternatives, and reduced motion is respected.
- **Performance:** screens that read IndexedDB render their data-driven parts together once the data is in (a few ms), so nothing jumps as it arrives (layout shift dropped from up to 0.93 to 0). Lighthouse mobile scores for a returning user: Home 95–98, Fast 96, Train 99, Log 97. The very first visit scores lower (Home 87, Train 80) because the welcome sheet is the largest paint and appears after the database opens.
- **PWA:** Lighthouse 12 no longer has a PWA category. Installability was checked directly instead: the manifest, maskable icons, a service worker scoped to `/`, and every screen opening offline (tested in Chromium).
