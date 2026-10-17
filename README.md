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
2. Go to https://vercel.com/new, import `wyatt-blome/Lyfestyle`, and keep the detected Next.js settings. You don't need any environment variables for Phase 1.
3. Click **Deploy** and open the `*.vercel.app` URL on your phone.
   - **iPhone:** in Safari, tap Share → Add to Home Screen.
   - **Android/desktop Chrome:** use the menu → Install app.
4. Later phases add optional variables in Project → Settings → Environment Variables: `USDA_API_KEY` (Phase 3), and `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Phase 4, optional sync). See `.env.example`.

## Backups

Your data lives only in this browser's storage. Use Settings → Backup → Export regularly; the app reminds you after 7 days. Import replaces everything on the device with the backup.
