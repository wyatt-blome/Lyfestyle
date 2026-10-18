// Shared data shapes (spec Part 4). Every stored record carries the Base fields; timestamps are
// UTC ISO strings, dates are YYYY-MM-DD in the device zone.

export interface Base {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type ProtocolId =
  | "13:11"
  | "16:8"
  | "18:6"
  | "20:4"
  | "OMAD"
  | "24h"
  | "36h"
  | "48h"
  | "custom";

export type FastStatus = "active" | "completed" | "broken";

export interface Fast extends Base {
  protocol: ProtocolId;
  targetHours: number;
  startAt: string;
  endAt?: string;
  status: FastStatus;
  notes?: string;
  energy?: number;
  hunger?: number;
  mood?: number;
  sleep?: number;
  doctorAck?: boolean;
  /** Which reminders already fired for this fast (halfway, target, window). */
  remindersFired?: string[];
}

export type IntakeKind = "meal" | "snack" | "drink" | "supplement";

export interface Electrolytes {
  naMg?: number;
  kMg?: number;
  mgMg?: number;
}

export interface IntakeEntry extends Base {
  at: string;
  kind: IntakeKind;
  name: string;
  qty?: number;
  unit?: string;
  kcal?: number;
  proteinG?: number;
  caffeine?: boolean;
  electrolytes?: Electrolytes;
  breaksFast: boolean;
  fastId?: string;
  tags: string[];
  source?: "manual" | "off" | "usda";
  barcode?: string;
}

export type IntakeTemplate = Omit<IntakeEntry, keyof Base | "at" | "fastId">;

export interface FavoriteItem extends Base {
  label: string;
  template: IntakeTemplate;
  sort: number;
}

// ---------- Exercises & sessions (seeded, not stored per user) ----------

export type Equipment = "kettlebell" | "dumbbell" | "bench" | "bodyweight" | "cardio" | "mixed";

export interface ExerciseMedia {
  primary: "exercisedb" | "wger" | "none";
  gifUrl?: string;
  /** Second GIF for combined moves (Bell & Step shows swing + step-up). */
  gifUrl2?: string;
  imageUrl?: string;
  credit?: string;
  approx: boolean;
  youtube?: { videoId: string; start: number; end: number };
  ownClip?: string;
}

export interface Exercise {
  id: string;
  name: string;
  equipment: Equipment;
  defaultLoadLb?: number;
  unit: "reps" | "seconds" | "meters";
  cues: string[];
  faults: string[];
  swapIds: string[];
  media: ExerciseMedia;
}

export type SessionType = "strength" | "mobility" | "interval" | "zone2" | "quick20";

export type TimerMode =
  | "EMOM"
  | "AMRAP"
  | "TABATA"
  | "LADDER"
  | "INTERVAL"
  | "ROUNDS"
  | "STRAIGHT_SETS";

export interface SessionItem {
  exerciseId: string;
  sets?: number;
  reps?: number | string;
  perSide?: boolean;
  seconds?: number;
  meters?: number;
  loadLb?: number;
  restSec?: number;
  note?: string;
  /** Done at intervals during the block's previous item, not as a step of its own (Z's carry). */
  everySec?: number;
}

export interface SessionBlock {
  label: string;
  rounds?: number;
  restSec?: number;
  /** Optional interval-engine spec for this block (Quick 20 work blocks, 4×4). */
  timer?: TimerSpec;
  items: SessionItem[];
}

export interface TimerSpec {
  mode: TimerMode;
  /** Total work seconds for capped modes (EMOM/AMRAP/LADDER). */
  durationSec?: number;
  /** EMOM: seconds per slot (default 60). INTERVAL: seconds per interval. */
  intervalSec?: number;
  /** ROUNDS/TABATA/INTERVAL: number of rounds. */
  rounds?: number;
  workSec?: number;
  restSec?: number;
  /** TABATA: number of blocks and rest between them. */
  blocks?: number;
  blockRestSec?: number;
}

export type SessionId =
  | "A"
  | "B"
  | "C"
  | "M"
  | "Z"
  | "DAILY10"
  | "Q1"
  | "Q2"
  | "Q3"
  | "Q4"
  | "Q5"
  | "Q6"
  | "Q7"
  | "Q8"
  | "Q9";

export interface SessionTemplate {
  id: SessionId;
  name: string;
  type: SessionType;
  fullMin: number;
  shortMin: number;
  /** Short plain-language description shown on the Today card. */
  summary: string;
  timer?: TimerSpec;
  blocks: SessionBlock[];
  shortDay: { blocks: SessionBlock[] };
  /** exerciseId -> swap exerciseId for this session. */
  swaps: Record<string, string>;
  whyCardIds: string[];
  /** Hard sessions are hidden during fasts over 24 h. */
  hard?: boolean;
  progressionNote?: string;
}

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface Rotation {
  startDate: string;
  weekdayMap: Record<Weekday, string>;
  quickCycle: SessionId[];
  deloadEvery: number;
}

export interface WorkoutSet {
  exerciseId: string;
  setIndex: number;
  reps?: number;
  seconds?: number;
  meters?: number;
  loadLb?: number;
  rpe?: number;
  done: boolean;
}

export interface WorkoutLog extends Base {
  templateId: SessionId;
  date: string;
  variant: "full" | "short" | "easy";
  startedAt: string;
  endedAt?: string;
  rpe?: number;
  notes?: string;
  sets: WorkoutSet[];
  quick?: { rounds: number; rungs: number; extraReps: number };
  hr?: { intervals: { peak: number; avg: number }[] };
}

export interface ProgressionState extends Base {
  exerciseId: string;
  stage: number;
  currentLoadLb: number;
  repTarget: number;
  consecutiveHits: number;
}

export interface BodyMetric extends Base {
  at: string;
  weightLb?: number;
  waistIn?: number;
  restingHr?: number;
  bpSys?: number;
  bpDia?: number;
}

export interface Readiness extends Base {
  date: string;
  sleep: number;
  soreness: number;
  energy: number;
}

// ---------- Expert content (seeded) ----------

export interface Chapter {
  /** "mm:ss" or "h:mm:ss" as in the show notes. */
  t: string;
  title: string;
}

export interface Episode {
  id: string;
  guest: string;
  date: string;
  /** Watch URL, or null when only the podcast feed carries it. */
  url: string | null;
  /** YouTube video id when url is a YouTube watch link. */
  youtubeId?: string;
  title: string;
  chapters: Chapter[];
  summary: string;
  verified: boolean;
}

export interface WhyRef {
  episodeId: string;
  /** Chapter time "h:mm:ss"/"mm:ss"; absent means the whole episode. */
  t?: string;
}

export interface WhyCard {
  id: string;
  appliesTo: string[];
  title: string;
  body: string;
  /** Outside evidence links named in the plan text (NTNU, PubMed, ACE). */
  evidence?: { label: string; url: string }[];
  refs: WhyRef[];
  unverified?: string;
  disagreement?: boolean;
}

export interface ExpertInsight extends Base {
  episodeId?: string;
  principle: string;
  url: string;
  source: "seed" | "user";
  myTake?: string;
}

// ---------- Settings ----------

export interface NotificationPrefs {
  halfway: boolean;
  target: boolean;
  windowClosing: boolean;
  sound: boolean;
  voice: boolean;
  vibrate: boolean;
}

export type ThemePref = "dark" | "light" | "system";

export interface Settings {
  id: "settings";
  units: "imperial" | "metric";
  age: number;
  defaultProtocol: ProtocolId;
  customHours: number;
  tz: string;
  rotationStartDate: string;
  bellsLb: number[];
  dumbbellsLb: number[];
  notifications: NotificationPrefs;
  onboarded: boolean;
  /** Colour theme; absent means dark (the gym-at-6am default). */
  theme?: ThemePref;
  lastBackupAt?: string;
  updatedAt: string;
}

/** Per-episode personal note on /why/episodes. */
export interface EpisodeNote extends Base {
  episodeId: string;
  myTake: string;
}
