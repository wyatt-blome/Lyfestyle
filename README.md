# Fast & Move

A personal fasting, food-timing and workout PWA for one user. Fasting is the centerpiece. The training plan is a fixed rotation with a looped demo for every move, and "Why we do this" cards are summarized from official Diary of a CEO show notes and chapter titles. It works offline, everything stays on the phone, and it costs $0.

- How it fits together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Judgment calls: [docs/DECISIONS.md](docs/DECISIONS.md)

Not medical advice. Check with your doctor before fasts over 24 h or hard intervals if you have heart, blood-pressure or blood-sugar issues.

## Run it locally

Needs Node 22+.

```bash
npm ci
npm run dev          # http://localhost:3000 (service worker off in dev)
```

To test install and offline, run a production build:

```bash
npm run build && npm start   # http://localhost:3000
```

## Check changes

```bash
npm run validate     # typecheck, lint, tests, build
```

## Deploy to Vercel (Hobby, free)

1. Push this repository to GitHub (already done if you're reading this there).
2. Go to https://vercel.com/new, import `wyatt-blome/Lyfestyle`, and keep the detected Next.js settings. No environment variables are required.
3. Click **Deploy** and open the `*.vercel.app` URL on your phone.
   - **iPhone:** in Safari, tap Share → Add to Home Screen.
   - **Android/desktop Chrome:** use the menu → Install app.
4. Optional extras go in Project → Settings → Environment Variables (all listed in `.env.example`). After adding or changing them, redeploy.
   - **Food search:** `USDA_API_KEY`, a free key from https://fdc.nal.usda.gov/api-key-signup.
   - **Sync between devices:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see below).
   - **Background reminders (web push):** see [docs/PUSH.md](docs/PUSH.md).

The build downloads the exercise demos into `public/media` (`scripts/fetch-media.mjs`). If a host can't be reached, that demo loads from its original URL instead, and the phone caches it after first view.

## Optional sync (Supabase Free)

The app works fully without this. To keep two devices in step:

1. Create a free project at https://supabase.com.
2. In the SQL editor, run `supabase/schema.sql`. It creates one `records` table with row-level security, so each user can only see their own rows.
3. Under Authentication → URL Configuration, set **Site URL** to your Vercel URL and add `https://<your-app>.vercel.app/settings` to the redirect URLs.
4. Under Project Settings → API, copy the **Project URL** and the **anon public** key into Vercel as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then redeploy.
5. In the app, open Settings → Sync, enter your email, and open the magic link on the same phone. Do the same on the other device.

How it behaves:
- It syncs when the app opens, every 5 minutes, and whenever you come back to the app.
- **Conflicts:** the newest edit wins, by each record's `updatedAt`.
- **Deletes:** they are soft (`deletedAt`), so they sync like any other edit.
- **What doesn't sync:** timers in progress and swaps stay on each device.
- **Idle projects:** free projects pause after about a week without use. Sync then shows a "restore it" message until you resume the project in the Supabase dashboard.

## Backups

Your data lives only in this browser's storage. Use Settings → Backup → Export regularly; the app reminds you after 7 days. Import replaces everything on the device with the backup.
