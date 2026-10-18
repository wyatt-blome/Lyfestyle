# Architecture

Fast & Move is a single-user, local-first PWA: Next.js (App Router, static pages), TypeScript strict, Tailwind 4, Dexie (IndexedDB), and a Serwist service worker. There is no account and no server data. Why things are this way: [DECISIONS.md](DECISIONS.md).

## Code layout

| Path | What lives there |
| --- | --- |
| `src/lib/` | Pure logic with Vitest tests beside it:<br>• `fasting.ts`: protocols, stages, safety, streaks, averages, reminders<br>• `rotation.ts`: week, cycle week, deload, missed days<br>• `timer.ts`: the interval engine<br>• `progression.ts`: ladders, double progression, Quick 20 hints<br>• `session.ts`: variants, deload scaling, HR zones, deload triggers<br>• `logger.ts`: set rows and prefill<br>• `food.ts` and `off.ts`: day bounds, timeline, food-lookup parsing<br>• `progress.ts`: summaries and readiness<br>• `sync.ts`: last-write-wins helpers<br>• `webpush.ts`: VAPID and aes128gcm<br>• also `time.ts`, `backup.ts`, `why.ts` (card resolution, chapter deep links) and `types.ts` (the data model) |
| `src/seed/` | Content that ships with the app: `exercises.json`, `episodes.json`, `whyCards.json`, `sessions.ts`, plus `seed.test.ts`, which checks every card ref resolves |
| `src/db/` | Dexie schema (`db.ts`, versioned) and record helpers (`records.ts`: id, createdAt, updatedAt, soft delete) |
| `src/client/` | Device hooks and actions: settings, fasts, intake, favorites, backup, reminders, today's plan, session plans, workouts (logs, progression updates, swaps, resumable runs and drafts), cues (beeps, speech, wake lock), readiness, metrics, insights, sync, push |
| `src/ui/` | Components (`kit.tsx`, `FastRing`, `WhyCard`, `FastFlows`, `TodayCard`, `TabBar`) and `screens/` |
| `src/app/` | Routes (each a one-line wrapper around a screen), `manifest.ts`, `sw.ts`, `serwist/[path]/route.ts` (which builds the worker), and the server routes `api/usda`, `api/off/[barcode]` and `api/push/*` |
| `scripts/fetch-media.mjs` | Prebuild: downloads demos to `public/media` and writes `src/seed/media-manifest.json` |
| `supabase/` | SQL for optional sync (`schema.sql`) and push jobs (`push.sql`) |

## Time
Timestamps are stored as UTC ISO strings and days are grouped in the device time zone (`dateKey`). Every duration is computed from stored timestamps and the current time, never by counting ticks, so the fast timer is right after the phone sleeps or the app reloads.

## Offline
The service worker precaches build files and the HTML of every route in `src/ui/routes.ts` (one revision per build). Navigations fall back to the cached shell. Exercise media from ExerciseDB and wger are cached cache-first as they load. Data never leaves IndexedDB, and the app asks the browser for persistent storage on first run.

## Training screens
Train shows today's session from the rotation: Start, Short Day or Easy Day. Each session page (`/train/session?id=…`) lists every move with its dose, a looped demo, its cues and a Swap sheet, with the session's why-card at the top. Starting a session opens:
- **A and B:** the set logger (`/train/log`).
- **Quick 20s:** the Quick 20 runner (`/train/quick`).
- **C:** the 4×4 runner (`/train/4x4`).
- **M, Daily 10 and Z:** the follow-along (`/train/follow`).

The three runners share `src/ui/train/Runner.tsx` and the engine in `src/lib/timer.ts`. A run and a logger draft are stored in `kv`, so either resumes after a reload.
