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
