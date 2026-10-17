# Fast & Move: the build specification

This is the owner's build prompt (Parts 1–5, 7 and 8), kept as the source of truth (DECISIONS D1). The seed data in Part 6 lives in `src/seed/` and is checked by `src/seed/seed.test.ts`. Judgment calls are recorded in `DECISIONS.md`.

## 1. Vision & user
One app for one user (Wyatt: a busy rancher/consultant, America/Denver). Fasting is the centerpiece, alongside a food & drink log with times and a workout plan he **never has to think about**: open the app and it shows today's session with a looped demo for every move. Simple, offline, $0. The fasting and training rationale is **built around Diary of a CEO (DOAC) expert interviews**, shown as "Why we do this" cards.
- **Goals, in order:** anti-aging/longevity > mobility > strength. **No bulking.** A core rebuild runs through everything.
- **Gear:** dumbbells, a bench, single kettlebells of **10, 15 and 40 lb**. Settings let him add bells/DBs later.
- **Loves:** 20-min single-kettlebell workouts (EMOM, flows/complexes, ladders, AMRAPs), suitcase carries, the Norwegian 4×4. **No long runs.** Sessions are 20–50 min. **No daily decisions:** a fixed rotation, plus Short Day / Easy Day / Swap buttons.
- Nothing to record or fetch: demos and expert content ship with the app.

## 2. Stack & non-negotiables
- **Next.js (latest, App Router) + TypeScript strict + Tailwind**, deployed on **Vercel Hobby** (free, personal use). Mostly static and client components. Server routes only for secrets (USDA key).
- **PWA:** `app/manifest.ts` + **Serwist** service worker. Precache the shell and today's media, and runtime-cache the rest. Installable on iPhone (Safari → Add to Home Screen) and Android/desktop Chrome. iOS web push only works for installed PWAs on 16.4+, so the MVP uses in-app reminders.
- **Local-first:** IndexedDB via **Dexie** + dexie-react-hooks. Call `navigator.storage.persist()`. JSON export/import of everything, plus a "last backup" reminder after 7 days. **Optional Supabase Free sync** in Phase 4, behind a flag (magic link, RLS on user_id, last-write-wins on updatedAt, soft deletes; free projects pause when idle). The app must work fully without it.
- Store UTC ISO timestamps and display in the device zone. No ads, analytics, tracking, or paid APIs.
- **UI:** mobile-first, dark default, bottom tabs (Home, Fast, Log, Train, More), tap targets ≥ 48 px, big type, usable with sweaty hands.
- **Disclaimer** on onboarding and the fasting screen: "Not medical advice. Check with your doctor before fasts over 24 h or hard intervals if you have heart, blood-pressure or blood-sugar issues." Extended fasts also show a dizziness/stop warning.
- **Expert content rules:** use the seed text as given and label it "Summarized from official show notes/chapter titles". Never invent a recommendation, number or quote, and never store transcripts. If episodes are ever added, use only the official DOAC RSS `<description>` (https://rss2.flightcast.com/xmsftuzjjykcmqwolaqn6mdn) or the official YouTube description (check via oEmbed that author_name = "The Diary Of A CEO"). Never attribute generic numbers (stage hours, 4×4 timings, Big 3) to a guest.

## 3. Modules
**Fasting (MVP).** Big ring timer: elapsed, remaining, target, projected end. Start/stop with backdating and later edits.
- **Protocols:** 13:11, 16:8 (default), 18:6, 20:4, OMAD (23:1), 24h, 36h, 48h, custom.
- **Stage timeline** (labelled "approximate, varies by person", no guest attribution): 0–4h fed · 4–12h insulin falling · 12–18h glycogen falling, fat use rising · 18–24h ketones rising · 24–48h deeper ketosis (extended, doctor note).
- **During a fast:** quick-log water, black coffee, plain tea, and electrolytes (optional Na/K/Mg mg), with running totals. Logging anything with calories prompts "End fast now?".
- **End-of-fast check-in:** energy, hunger, mood, sleep (1–5) plus notes.
- **History:** calendar heatmap, streaks (target hit), and 7/30-day averages.
- **Reminders:** halfway, target reached, and "window closes in 30 min".
- **Why card** for the selected protocol.

**Safety rules (enforced):**
- Fasts over 24 h require ticking the doctor note.
- 36 h+ fasts show the electrolytes reminder and a stop-if-dizzy/faint/palpitations warning. Break long fasts gently with a small protein meal.
- During an active fast over 24 h, Train shows only M, Z or Daily 10, and hides the 4×4, Q5, and heavy carries.
- Default to 16:8. Suggest 18:6 2–4×/week once 16:8 is easy. OMAD is optional, max 1–2×/week. A 24 h fast is occasional (every 1–4 weeks), done on an M or Z day.

**Food & Drink log.**
- **Entry fields:** time (defaults to now, editable), kind (meal/snack/drink/supplement), name, quantity, protein g, kcal (optional), caffeine, electrolytes, tags, breaksFast.
- **Quick-add:** Water 16 oz, Black coffee, Electrolytes, and user favorites. "Copy yesterday."
- **Day timeline** shading the eating vs fasting window.
- Logging the first breaksFast item during a fast prompts "End fast at <time>?" and shows the why-protein card.
- **v1:** barcode scan (BarcodeDetector, else @zxing/browser) → Open Food Facts (ODbL, custom User-Agent). USDA FoodData Central search via a server route holding `USDA_API_KEY`.

**Workouts.**
- **Today:** the session from the rotation (Part 5), with total time and Start / Short Day / Easy Day.
- **Session list:** every exercise with sets × reps/time/meters, load, rest, cues, a **looped demo** and a Swap sheet. The session's collapsible why-card at the top.
- **Active logger:** pre-filled with last values, tap a set done to start the auto rest timer, RPE picker, notes.
- **Progression engine** suggests the next load/reps (Part 5).
- **4×4 runner:** interval engine, HR zones from HRmax = 211 − 0.64 × age (work 85–95%, recovery ~70%), manual HR entry per interval, and a mode chooser (Hill / Bike-Rower / Bell & Step / Outdoor chores).
- **Program view:** week, cycle week, deload flag, stage per key lift.

**LoopedDemo:**
- **Render order:** ownClip (only if the file exists; optional) → primary demo (GIF `<img>`, or wger image with credit) → optional YouTube embed (`youtube-nocookie.com/embed/<id>?start&end&loop=1&playlist=<id>&mute=1&playsinline=1`; IFrame API seeks back to start on end) → text cues.
- **Media caching:** a prebuild script downloads GIFs and images to /public/media, falling back to the remote URL.

**Quick 20 mode (core feature).**
- A big Home button. The picker defaults to the next session in the cycle.
- **Full-screen timer** for prep 3:00 → work 15:00 → downshift 2:00: huge countdown, current move, reps, bell weight, looped demo, next-move preview, round/rung counter with +1, pause/resume/end-early (saves partial).
- **Interval engine** (pure TS state machine): modes EMOM, AMRAP, TABATA, LADDER, INTERVAL, ROUNDS, STRAIGHT_SETS. Time is **derived from stored timestamps, never from tick counting**. The state is serialized to IndexedDB so it resumes after reload or backgrounding.
- **Cues:** Web Audio beeps (unlocked on first tap), optional speechSynthesis, Wake Lock (re-acquired on visibilitychange), and vibrate where supported.

**Mobility.** Session M and the Daily 10 run as follow-alongs: one move at a time, a hold timer, a demo, then auto-advance.

**Why we do this / Experts (MVP, seeded).**
- Cards are resolved by `appliesTo` and shown on the protocol picker, Fast screen, every session, the 4×4 runner, Quick 20, matching exercises, and the break-fast prompt.
- **Card content:** our plan → expert refs (guest, year, chapter deep link) → ⚠ unverified line → "Experts disagree" badge.
- **/why** lists the cards. **/why/episodes** lists episodes with summaries and links, plus a personal myTake note.
- **v1:** own insights (≤ 280 chars, URL required, source:'user').

**Progress (v1).** Weight, waist, BP and resting HR entries. Charts: fasting hours, sessions/week, lift progression, Quick 20 scores, 4×4 HR. Weekly summary. Readiness check-in (sleep/soreness/energy 1–5); an average ≤ 2 suggests an Easy Day.

**Settings.** Units, age, default protocol, rotation start date, gear, notifications, export/import, sync, and a **Credits** page (ExerciseDB by AscendAPI, wger image licences, Open Food Facts, USDA, linked DOAC episodes).

## 4. Data model
Dexie; every record has id uuid, createdAt, updatedAt, deletedAt?; versioned migrations. See `src/lib/types.ts`. Pure logic goes in `lib/` with Vitest tests: rotation (cycle week, deload, missed day), progression, timer engine, fasting (stages, streaks, the >24 h rule), plus a test that every card ref resolves.

## 5. The program (source of truth)
| Day | Session | Full / Short |
|---|---|---|
| Mon | A Bell & Carry | 40 / 20 |
| Tue | M Mobility & Core | 30 / 15 |
| Wed | C Norwegian 4×4 | 38 / 24 |
| Thu | B Bench & Bell | 40 / 20 |
| Fri | Quick 20 (cycle Q1 EMOM → Q2 Flow → Q3 Ladder → Q4 AMRAP → Q5 Tabata → Q6 S&S deload, then repeat) | 20 + 5 min mobility |
| Sat | Z Ranch Zone 2 (or a 2nd Quick 20 = the next one in the cycle) | 30–50 / 20 |
| Sun | Rest + optional Daily 10 | |

**Rules:**
- A missed day is skipped, never doubled. A missed Wed 4×4 moves to Sat, replacing Z.
- Easy Day = M, Z or Daily 10.
- Every 6th week is a deload: ~60% of sets, nothing to failure. Also deload on sleep < 6 h two nights running, a ≥ 36 h fast, illness, or readiness ≤ 2.
- Strength work at RPE 6–8, never grinding.
- On 16:8 / 18:6, train any time; hard sessions go late in the fast or inside the eating window. On OMAD days, do hard sessions before the meal.

Session contents (Daily 10, A, M, C, B, Z, Q1–Q9) are in `src/seed/sessions.ts`.

**Progression:** double progression. Hitting the top of the rep range at RPE ≤ 7 in 2 sessions moves you to the next load at the bottom of the range.
- **Swing:** two-hand 10×10 in 5 min → one-hand alternating 10×10 crisp → nasal recovery between sets → paused swings or a heavier bell.
- **TGU:** 10 lb 5/side in 10 min → 15 → DBs 20–35 → 40 lb KB (35 lb DB TGUs must be smooth first).
- **Press:** 15 lb ladders 1-2-3 ×3 → 1-5 ×3 → DB 20–25 → 40.
- **Goblet squat (40):** 3×5 paused → 3×8 → 3×10 with a 3 s lowering → 1¼ reps.
- **Suitcase carry (40):** 20 m → 40 m → 60 m per side → KB + DB on the same side.
- **Big 3:** 5-3-1 → 6-4-2 → 8-6-4 → 10-8-6 (holds always ~10 s).
- **4×4:** 3 at 85% → 4 at 85–90% → 4 at 90–95%.
- **Quick 20s:** score +1 two sessions in a row → +1 rep on the hardest move, or a bigger bell on one move.
- **15 → 40 lb on a move:** allowed once you can do 2× the target reps at 15 lb with perfect form. Bridge with DBs.

## 7. Phases
1. **Skeleton + Fasting:** setup, PWA, Dexie + all seeds, tabs, Home (fast ring, today card, quick-add, Quick 20 button, why teaser), Fast + history + why cards + safety rules, /why, Settings with export/import. Deploy to Vercel.
2. **Workouts:** rotation engine, media cache script, Today/session list with demos and why cards, logger, rest timer, swaps, Short/Easy Day, Quick 20 with the full interval engine, 4×4 runner, program view, exercise library (credits, approximate tag).
3. **Food log + Progress + Insights:** log with favorites and fast integration, barcode/OFF/USDA, charts, readiness, user insights.
4. **Sync + polish:** Supabase behind a flag, VAPID web push (installed iOS 16.4+/Android), accessibility, Lighthouse PWA/perf ≥ 90.

## 8. Acceptance criteria
- **Install and offline:** installs on iPhone and Android, and Home, Fast and Train work offline.
- **Fast timer:** start 16:8, lock the phone 30 min, reopen, and the time is correct. Backdating by 2 h works. Logging "Breakfast" mid-fast prompts to end it, and history records that time.
- **Rotation:** Monday shows A, and Short Day shows its 20-min version. Friday shows the correct Q for the cycle week. Week 6 is flagged as a deload.
- **Quick 20 timers:** Q1 runs 3:00 prep + 15 one-minute rounds cycling swing → clean & press → goblet squat + 2:00 downshift, with beeps, wake lock and the right demos. Backgrounding it for 2 min doesn't throw off the timer. The Q4 score saves, and the next Q4 shows the last score.
- **Progression:** the swing moves to one-hand after 2 qualifying sessions.
- **Fasting safety:** during a fast over 24 h, Train shows only Easy options and hides the 4×4 and Q5. A fast over 24 h requires the doctor acknowledgement.
- **Why cards:** every protocol and every session (A, B, C, M, Z, DAILY10, Q1–Q9) shows a why card with ≥ 1 episode deep link that opens at the right timestamp. The OMAD card shows its ⚠ line, and the protein card shows "Experts disagree". No transcript text anywhere.
- **Demos:** every exercise shows a GIF or image, or a clear "follow the cues" state for NONE. The Credits page lists the sources.
- **Backup:** export → wipe → import restores everything.
- **Build:** `npm run build`, lint and tests pass. README with local dev and Vercel deploy steps. Ask before adding any dependency over 100 kB. Log judgment calls in DECISIONS.md, choosing whatever means fewer decisions mid-workout.
