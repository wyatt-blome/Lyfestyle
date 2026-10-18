import type { SessionTemplate, SessionBlock, SessionItem, Rotation, TimerSpec } from "@/lib/types";

// Session templates (spec Part 5). Strength work is at RPE 6–8.

// ---------- Shared pieces ----------

const BIG3: SessionItem[] = [
  { exerciseId: "mcgill-curl-up", reps: "5-3-1", perSide: true, note: "10 s holds" },
  { exerciseId: "side-bridge", reps: "5-3-1", perSide: true, note: "10 s holds" },
  { exerciseId: "bird-dog", reps: "5-3-1", perSide: true, note: "10 s holds" },
];

const DAILY10_ITEMS: SessionItem[] = [
  { exerciseId: "cat-camel", reps: 6 },
  ...BIG3,
  { exerciseId: "kb-halo", reps: 5, perSide: true, loadLb: 10 },
  { exerciseId: "kb-prying-squat", seconds: 45, loadLb: 15 },
  { exerciseId: "worlds-greatest", reps: 3, perSide: true },
];

const daily10Block = (): SessionBlock => ({ label: "Daily 10", items: DAILY10_ITEMS.map((i) => ({ ...i })) });
const big3Block = (label = "McGill Big 3"): SessionBlock => ({ label, items: BIG3.map((i) => ({ ...i })) });

const quickPrep = (): SessionBlock => ({
  label: "Prep 3:00",
  items: [
    { exerciseId: "kb-halo", reps: 5, perSide: true, loadLb: 10 },
    { exerciseId: "kb-prying-squat", seconds: 30, loadLb: 15 },
    { exerciseId: "kb-swing-2h", reps: 10, note: "light" },
    { exerciseId: "bird-dog", reps: 3, perSide: true },
  ],
});

const quickDownshift = (): SessionBlock => ({
  label: "Downshift 2:00",
  items: [
    { exerciseId: "couch-stretch", seconds: 30, perSide: true },
    { exerciseId: "deep-squat-hold", seconds: 30 },
    { exerciseId: "breathing-reset", reps: 5, note: "5 slow breaths lying down" },
  ],
});

/** Build a Quick 20 template: prep → work block(s) → downshift; short day = same blocks. */
function quick(
  t: Omit<SessionTemplate, "type" | "fullMin" | "shortMin" | "blocks" | "shortDay" | "swaps" | "whyCardIds"> & {
    work: SessionBlock[];
  },
): SessionTemplate {
  const { work, ...rest } = t;
  const blocks = (): SessionBlock[] => [quickPrep(), ...work.map((b) => ({ ...b, items: b.items.map((i) => ({ ...i })) })), quickDownshift()];
  return {
    ...rest,
    type: "quick20",
    fullMin: 20,
    shortMin: 20,
    blocks: blocks(),
    shortDay: { blocks: blocks() },
    swaps: {},
    whyCardIds: ["why-quick20"],
  };
}

// ---------- DAILY10 ----------

const DAILY10: SessionTemplate = {
  id: "DAILY10",
  name: "Daily 10",
  type: "mobility",
  fullMin: 10,
  shortMin: 4,
  summary: "Warm-up for every session, or alone on Sunday.",
  blocks: [daily10Block()],
  shortDay: { blocks: [big3Block()] },
  swaps: {},
  whyCardIds: ["why-mobility"],
  hard: false,
};

// ---------- A · Bell & Carry ----------

const A_SS: SessionBlock = {
  label: "S&S",
  items: [
    {
      exerciseId: "kb-swing-2h",
      sets: 10,
      reps: 10,
      loadLb: 40,
      note: "every 30 s; two-hand → one-hand alternating once Stage 2 is reached",
    },
    {
      exerciseId: "kb-tgu",
      sets: 10,
      reps: 1,
      loadLb: 10,
      note: "after 1 min rest: 1 rep at the top of each minute, alternating sides",
    },
  ],
};

const A: SessionTemplate = {
  id: "A",
  name: "Bell & Carry",
  type: "strength",
  fullMin: 40,
  shortMin: 20,
  summary: "Swings and get-ups, then squats, rows and carries.",
  blocks: [
    daily10Block(),
    A_SS,
    {
      label: "Block 2",
      rounds: 3,
      restSec: 60,
      items: [
        { exerciseId: "kb-goblet-squat", reps: "5-8", loadLb: 40, note: "2 s pause" },
        { exerciseId: "kb-row", reps: 8, perSide: true, loadLb: 40 },
        { exerciseId: "kb-suitcase-carry", meters: 30, perSide: true, loadLb: 40 },
      ],
    },
    {
      label: "Cool-down",
      items: [
        { exerciseId: "couch-stretch", seconds: 45, perSide: true },
        { exerciseId: "deep-squat-hold", seconds: 60 },
      ],
    },
  ],
  shortDay: { blocks: [big3Block(), { ...A_SS, items: A_SS.items.map((i) => ({ ...i })) }] },
  swaps: {
    "kb-swing-2h": "kb-deadlift",
    "kb-tgu": "kb-half-tgu",
    "kb-goblet-squat": "db-split-squat",
    "kb-suitcase-carry": "kb-suitcase-march",
  },
  whyCardIds: ["why-strength"],
  hard: true,
};

// ---------- M · Mobility & Core ----------

const M_ITEMS: SessionItem[] = [
  /* 1 */ { exerciseId: "cat-camel", reps: 8 },
  /* 2 */ ...BIG3.map((i) => ({ ...i, note: "today's pyramid; 10 s holds" })),
  /* 3 */ { exerciseId: "dead-bug", sets: 2, reps: 6, perSide: true },
  /* 4 */ { exerciseId: "hip-9090", sets: 2, reps: 8 },
  /* 5 */ { exerciseId: "couch-stretch", sets: 2, seconds: 60, perSide: true },
  /* 6 */ { exerciseId: "open-book", sets: 2, reps: 6, perSide: true },
  /* 7 */ { exerciseId: "kb-arm-bar", sets: 2, seconds: 30, perSide: true, loadLb: 10 },
  /* 8 */ { exerciseId: "kb-windmill", sets: 2, reps: 3, perSide: true, loadLb: 10 },
  /* 9 */ { exerciseId: "ham-floss", sets: 2, reps: 8, perSide: true },
  /* 10 */ { exerciseId: "glute-bridge", sets: 2, reps: 10, note: "2 s squeeze" },
  /* 11 */ { exerciseId: "kb-suitcase-march", sets: 2, seconds: 30, perSide: true, loadLb: 40 },
  /* 12 */ { exerciseId: "deep-squat-hold", seconds: 120, note: "2 min total" },
];

const M_SHORT_IDS = ["cat-camel", "mcgill-curl-up", "side-bridge", "bird-dog", "hip-9090", "couch-stretch", "kb-arm-bar", "deep-squat-hold"];

const M: SessionTemplate = {
  id: "M",
  name: "Mobility & Core",
  type: "mobility",
  fullMin: 30,
  shortMin: 15,
  summary: "Slow mobility and core work with nose breathing.",
  blocks: [{ label: "Mobility & Core (slow, nose breathing)", items: M_ITEMS.map((i) => ({ ...i })) }],
  shortDay: {
    blocks: [
      {
        label: "Mobility & Core (slow, nose breathing)",
        items: M_ITEMS.filter((i) => M_SHORT_IDS.includes(i.exerciseId)).map((i) => ({ ...i })),
      },
    ],
  },
  swaps: {},
  whyCardIds: ["why-mobility"],
  hard: false,
};

// ---------- C · Norwegian 4×4 ----------

const C_TIMER: TimerSpec = { mode: "INTERVAL", rounds: 4, workSec: 240, restSec: 180 };

const C_INTERVAL_NOTE =
  "4 min work reaching 85–95% HRmax in the last 2 min, then 3 min active recovery (~70%). " +
  "No HR strap: work pace = 2–3 words, not a sentence. " +
  "Modes: uphill hike/incline walk (default), bike or rower, bell & step (each work bout = continuous cycles of " +
  "10 two-hand swings at 40 lb + 6/6 bench step-ups; if grip fades, step-ups only), or outdoor chores uphill.";

const C: SessionTemplate = {
  id: "C",
  name: "Norwegian 4×4",
  type: "interval",
  // What the timer actually runs (10 + 4 × 4 + 3 × 3 recoveries + 5; short 6 + 2 × 4 + 3 + 4).
  // The spec table says 38 / 24; see DECISIONS D27.
  fullMin: 40,
  shortMin: 21,
  summary: "Four 4-minute hard efforts with 3-minute easy recoveries.",
  timer: C_TIMER,
  blocks: [
    { label: "Warm-up", items: [{ exerciseId: "interval-hill", seconds: 600, note: "60–70% HRmax" }] },
    {
      label: "Intervals",
      timer: C_TIMER,
      items: [{ exerciseId: "interval-hill", sets: 4, seconds: 240, restSec: 180, note: C_INTERVAL_NOTE }],
    },
    { label: "Cool-down", items: [{ exerciseId: "interval-hill", seconds: 300, note: "easy" }] },
  ],
  shortDay: {
    blocks: [
      { label: "Warm-up", items: [{ exerciseId: "interval-hill", seconds: 360, note: "60–70% HRmax" }] },
      {
        label: "Intervals",
        timer: { ...C_TIMER, rounds: 2 },
        items: [{ exerciseId: "interval-hill", sets: 2, seconds: 240, restSec: 180, note: C_INTERVAL_NOTE }],
      },
      { label: "Cool-down", items: [{ exerciseId: "interval-hill", seconds: 240, note: "easy" }] },
    ],
  },
  swaps: { "interval-hill": "interval-bike" },
  whyCardIds: ["why-4x4"],
  hard: true,
  progressionNote:
    "Weeks 1–2: 3 intervals at ~85%. Then 4 at 85–90% → 4 at 90–95%. Keep the times; make it steeper, faster or heavier.",
};

// ---------- B · Bench & Bell ----------

const B_SUPER_A: SessionBlock = {
  label: "Superset A (rest 60–90 s)",
  rounds: 3,
  restSec: 75,
  items: [
    { exerciseId: "db-bench-press", reps: "6-10", note: "RPE 7" },
    { exerciseId: "db-row", reps: "8-10", perSide: true },
  ],
};

const B_SUPER_B: SessionBlock = {
  label: "Superset B",
  rounds: 3,
  items: [
    { exerciseId: "db-split-squat", reps: "6-8", perSide: true, note: "bodyweight → DBs" },
    { exerciseId: "kb-sl-rdl", reps: 6, perSide: true, loadLb: 15, note: "15 → 40 lb" },
  ],
};

const copyBlock = (b: SessionBlock, over: Partial<SessionBlock> = {}): SessionBlock => ({
  ...b,
  ...over,
  items: b.items.map((i) => ({ ...i })),
});

const B: SessionTemplate = {
  id: "B",
  name: "Bench & Bell",
  type: "strength",
  fullMin: 40,
  shortMin: 20,
  summary: "Dumbbell press and row, split squats and single-leg RDLs, then a carry finisher.",
  blocks: [
    daily10Block(),
    copyBlock(B_SUPER_A),
    copyBlock(B_SUPER_B),
    {
      label: "Finisher",
      rounds: 3,
      items: [
        { exerciseId: "farmer-carry", meters: 40, loadLb: 40, note: "40 lb KB + matched DB" },
        { exerciseId: "kb-press", reps: 5, perSide: true, loadLb: 15 },
        { exerciseId: "dead-bug", reps: 6, perSide: true },
      ],
    },
    {
      label: "Cool-down",
      items: [
        { exerciseId: "open-book", reps: 5, perSide: true },
        { exerciseId: "half-kneel-hip-flexor", seconds: 45, perSide: true },
      ],
    },
  ],
  shortDay: {
    blocks: [big3Block("Daily 10 lite (Big 3)"), copyBlock(B_SUPER_A, { rounds: 2 }), copyBlock(B_SUPER_B, { rounds: 2 })],
  },
  swaps: {
    "db-bench-press": "db-floor-press",
    "db-split-squat": "kb-rack-lunge",
    "kb-sl-rdl": "kb-deadlift",
  },
  whyCardIds: ["why-strength"],
  hard: true,
};

// ---------- Z · Ranch Zone 2 ----------

const Z_FINISH: SessionBlock = {
  label: "Finish 3:00",
  items: [
    { exerciseId: "deep-squat-hold", seconds: 90 },
    { exerciseId: "couch-stretch", seconds: 45, perSide: true },
  ],
};

const Z: SessionTemplate = {
  id: "Z",
  name: "Ranch Zone 2",
  type: "zone2",
  fullMin: 40,
  shortMin: 20,
  summary: "An easy 30–50 min walk, hike or chores at conversational pace.",
  blocks: [
    {
      label: "Zone 2",
      items: [
        {
          exerciseId: "zone2-walk",
          seconds: 2400,
          note: "30–50 min; full-sentence, mostly nose-breathing pace, 60–70% HRmax; a brisk walk, hike or chores",
        },
        { exerciseId: "kb-suitcase-carry", seconds: 60, loadLb: 40, everySec: 600, note: "optional: 1 min every 10 min" },
      ],
    },
    copyBlock(Z_FINISH),
  ],
  shortDay: {
    blocks: [
      {
        label: "Zone 2",
        items: [{ exerciseId: "zone2-walk", seconds: 1200, note: "full-sentence, mostly nose-breathing pace" }],
      },
    ],
  },
  swaps: {},
  whyCardIds: ["why-zone2"],
  hard: false,
};

// ---------- Quick 20s ----------

const Q1_TIMER: TimerSpec = { mode: "EMOM", durationSec: 900, intervalSec: 60 };
const Q1 = quick({
  id: "Q1",
  name: "Q1 · EMOM 15",
  summary: "Every minute for 15: swings, clean & press, goblet squats.",
  timer: Q1_TIMER,
  hard: true,
  progressionNote: "Swings 15→20, press 4→6, then 1-hand swings.",
  work: [
    {
      label: "EMOM 15",
      timer: Q1_TIMER,
      items: [
        { exerciseId: "kb-swing-2h", reps: 15, loadLb: 40 },
        { exerciseId: "kb-press", reps: 4, perSide: true, loadLb: 15, note: "clean + press" },
        { exerciseId: "kb-goblet-squat", reps: 8, loadLb: 40 },
      ],
    },
  ],
});

const Q2_TIMER: TimerSpec = { mode: "ROUNDS", rounds: 5, restSec: 60 };
const Q2 = quick({
  id: "Q2",
  name: "Q2 · Bell Flow",
  summary: "One bell, six moves per side without setting it down, 5 rounds.",
  timer: Q2_TIMER,
  hard: true,
  progressionNote: "5→6→8 reps, then heavier bell on the swing/row/lunge.",
  work: [
    {
      label: "Bell Flow ×5",
      rounds: 5,
      restSec: 60,
      timer: Q2_TIMER,
      items: [
        { exerciseId: "kb-swing-1h", reps: 5, perSide: true, loadLb: 15, note: "one bell; all moves left, then right, without setting it down" },
        { exerciseId: "kb-clean", reps: 5, perSide: true, loadLb: 15 },
        { exerciseId: "kb-press", reps: 5, perSide: true, loadLb: 15 },
        { exerciseId: "kb-rack-lunge", reps: 5, perSide: true, loadLb: 15 },
        { exerciseId: "kb-row", reps: 5, perSide: true, loadLb: 15 },
        { exerciseId: "kb-sl-rdl", reps: 5, perSide: true, loadLb: 15 },
      ],
    },
  ],
});

const Q3_TIMER: TimerSpec = { mode: "LADDER", durationSec: 720 };
const Q3 = quick({
  id: "Q3",
  name: "Q3 · Ladder",
  summary: "Climb a squat/push-up/swing ladder for 12 min, then a 3 min carry.",
  timer: Q3_TIMER,
  hard: true,
  progressionNote: "Log the top rung; cap at 8, then go 1-hand.",
  work: [
    {
      label: "Ladder 12:00",
      timer: Q3_TIMER,
      items: [
        { exerciseId: "kb-goblet-squat", reps: "n", loadLb: 40, note: "rung n = 1, 2, 3…" },
        { exerciseId: "push-up", reps: "n" },
        { exerciseId: "kb-swing-2h", reps: 10, loadLb: 40 },
      ],
    },
    {
      label: "Carry 3:00",
      items: [{ exerciseId: "kb-suitcase-carry", seconds: 180, loadLb: 40, note: "switch hands every 30 s" }],
    },
  ],
});

const Q4_TIMER: TimerSpec = { mode: "AMRAP", durationSec: 900 };
const Q4 = quick({
  id: "Q4",
  name: "Q4 · AMRAP 15",
  summary: "As many rounds as possible in 15 min of swings, rows, squats, carries and halos.",
  timer: Q4_TIMER,
  hard: true,
  progressionNote: "Rounds +1 two sessions in a row → +1 rep on row and squat.",
  work: [
    {
      label: "AMRAP 15 (RPE 7)",
      timer: Q4_TIMER,
      items: [
        { exerciseId: "kb-swing-2h", reps: 10, loadLb: 40 },
        { exerciseId: "kb-row", reps: 5, perSide: true, loadLb: 40 },
        { exerciseId: "kb-goblet-squat", reps: 5, loadLb: 40 },
        { exerciseId: "kb-suitcase-carry", meters: 20, perSide: true, loadLb: 40 },
        { exerciseId: "kb-halo", reps: 3, perSide: true, loadLb: 10 },
      ],
    },
  ],
});

const Q5_TIMER: TimerSpec = { mode: "TABATA", rounds: 8, workSec: 20, restSec: 10, blocks: 3, blockRestSec: 60 };
const Q5 = quick({
  id: "Q5",
  name: "Q5 · Tabata",
  summary: "Three 4-minute Tabatas: swings, rack lunges, push-ups/dead bugs. The hardest Quick 20.",
  timer: Q5_TIMER,
  hard: true,
  progressionNote: "Hardest Q: skip on deloads and fasts > 24 h.",
  work: [
    {
      label: "Tabata ×3",
      timer: Q5_TIMER,
      items: [
        { exerciseId: "kb-swing-2h", loadLb: 40, note: "block 1" },
        { exerciseId: "kb-rack-lunge", loadLb: 15, note: "block 2; alternating legs" },
        { exerciseId: "push-up", note: "block 3; alternate with dead bug" },
        { exerciseId: "dead-bug", note: "block 3; alternate with push-up" },
      ],
    },
    { label: "Finish", items: [{ exerciseId: "kb-suitcase-march", seconds: 60, loadLb: 40 }] },
  ],
});

const Q6_SWING_TIMER: TimerSpec = { mode: "INTERVAL", intervalSec: 30, rounds: 10 };
const Q6 = quick({
  id: "Q6",
  name: "Q6 · S&S Deload",
  summary: "Simple & Sinister: 10×10 swings, then 10 get-ups. Doubles as the deload.",
  timer: Q6_SWING_TIMER,
  hard: true,
  work: [
    {
      label: "Swings",
      timer: Q6_SWING_TIMER,
      items: [{ exerciseId: "kb-swing-2h", sets: 10, reps: 10, loadLb: 40, note: "10 every 30 s; then 1 min rest" }],
    },
    {
      label: "Get-ups",
      timer: { mode: "EMOM", durationSec: 600, intervalSec: 60 },
      items: [{ exerciseId: "kb-tgu", sets: 10, reps: 1, loadLb: 10, note: "1 per minute, alternating sides; 10 or 15 lb" }],
    },
  ],
});

const Q7_TIMER: TimerSpec = { mode: "EMOM", durationSec: 900, intervalSec: 60 };
const Q7 = quick({
  id: "Q7",
  name: "Q7 · Carry Medley",
  summary: "Every minute for 15: suitcase carry left, right, then a rack carry.",
  timer: Q7_TIMER,
  hard: true,
  work: [
    {
      label: "EMOM 15",
      timer: Q7_TIMER,
      items: [
        { exerciseId: "kb-suitcase-carry", loadLb: 40, note: "left hand" },
        { exerciseId: "kb-suitcase-carry", loadLb: 40, note: "right hand" },
        { exerciseId: "kb-rack-carry", loadLb: 15, note: "L+R" },
      ],
    },
  ],
});

const Q8_TIMER: TimerSpec = { mode: "AMRAP", durationSec: 900 };
const Q8 = quick({
  id: "Q8",
  name: "Q8 · Get-Up & Goblet",
  summary: "As many rounds as possible in 15 min of get-ups, goblet squats and swings.",
  timer: Q8_TIMER,
  hard: true,
  work: [
    {
      label: "AMRAP 15",
      timer: Q8_TIMER,
      items: [
        { exerciseId: "kb-tgu", reps: 1, perSide: true, loadLb: 15 },
        { exerciseId: "kb-goblet-squat", reps: 10, loadLb: 40 },
        { exerciseId: "kb-swing-2h", reps: 10, loadLb: 40 },
      ],
    },
  ],
});

const Q9_TIMER: TimerSpec = { mode: "EMOM", durationSec: 900, intervalSec: 60 };
const Q9 = quick({
  id: "Q9",
  name: "Q9 · Mobility EMOM",
  summary: "An easy-day EMOM of halos, windmills and arm bars.",
  timer: Q9_TIMER,
  hard: false,
  work: [
    {
      label: "EMOM 15",
      timer: Q9_TIMER,
      items: [
        { exerciseId: "kb-halo", reps: 5, perSide: true, loadLb: 10 },
        { exerciseId: "kb-windmill", reps: 3, perSide: true, loadLb: 10 },
        { exerciseId: "kb-arm-bar", seconds: 20, perSide: true },
      ],
    },
  ],
});

export const sessions: SessionTemplate[] = [DAILY10, A, M, C, B, Z, Q1, Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9];

export const defaultRotation: Omit<Rotation, "startDate"> = {
  weekdayMap: { mon: "A", tue: "M", wed: "C", thu: "B", fri: "Q*", sat: "Z", sun: "REST" },
  quickCycle: ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"],
  deloadEvery: 6,
};
