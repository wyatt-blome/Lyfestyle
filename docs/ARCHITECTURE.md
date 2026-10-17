# Architecture

Fast & Move is a single-user, local-first PWA: Next.js (App Router, static pages), TypeScript strict, Tailwind 4, Dexie (IndexedDB), and a Serwist service worker. There is no account and no server data. Why things are this way: [DECISIONS.md](DECISIONS.md).

## Code layout

| Path | What lives there |
| --- | --- |
| `src/lib/` | Pure logic with Vitest tests beside it: `fasting.ts` (protocols, stages, safety, streaks, averages, reminders), `rotation.ts` (week, cycle week, deload, missed days), `time.ts`, `backup.ts`, `why.ts` (card resolution, chapter deep links), `types.ts` (the data model) |
| `src/seed/` | Content that ships with the app: `exercises.json`, `episodes.json`, `whyCards.json`, `sessions.ts`, plus `seed.test.ts`, which checks every card ref resolves |
| `src/db/` | Dexie schema (`db.ts`, versioned) and record helpers (`records.ts`: id, createdAt, updatedAt, soft delete) |
| `src/client/` | Device hooks and actions: settings, fasts, intake, backup, reminders, today's plan |
| `src/ui/` | Components (`kit.tsx`, `FastRing`, `WhyCard`, `FastFlows`, `TodayCard`, `TabBar`) and `screens/` |
| `src/app/` | Routes (each a one-line wrapper around a screen), `manifest.ts`, `sw.ts`, and `serwist/[path]/route.ts`, which builds the worker |

## Time
Timestamps are stored as UTC ISO strings and days are grouped in the device time zone (`dateKey`). Every duration is computed from stored timestamps and the current time, never by counting ticks, so the fast timer is right after the phone sleeps or the app reloads.

## Offline
The service worker precaches build files and the HTML of every route in `src/ui/routes.ts` (one revision per build). Navigations fall back to the cached shell. Exercise media from ExerciseDB and wger are cached cache-first as they load. Data never leaves IndexedDB, and the app asks the browser for persistent storage on first run.
