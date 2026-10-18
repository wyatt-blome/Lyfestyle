// The device database (IndexedDB via Dexie). Only personal records live here; exercises, sessions,
// episodes and why-cards ship with the app in src/seed (DECISIONS D4).
import Dexie, { type EntityTable } from "dexie";
import type {
  BodyMetric,
  EpisodeNote,
  ExpertInsight,
  Fast,
  FavoriteItem,
  IntakeEntry,
  ProgressionState,
  Readiness,
  Settings,
  WorkoutLog,
} from "@/lib/types";

/** Small key/value rows: running timer state, last reminder check, and similar. */
export interface KV {
  key: string;
  value: unknown;
  updatedAt: string;
}

export class FastMoveDB extends Dexie {
  fasts!: EntityTable<Fast, "id">;
  intake!: EntityTable<IntakeEntry, "id">;
  favorites!: EntityTable<FavoriteItem, "id">;
  workoutLogs!: EntityTable<WorkoutLog, "id">;
  progression!: EntityTable<ProgressionState, "id">;
  bodyMetrics!: EntityTable<BodyMetric, "id">;
  readiness!: EntityTable<Readiness, "id">;
  insights!: EntityTable<ExpertInsight, "id">;
  episodeNotes!: EntityTable<EpisodeNote, "id">;
  settings!: EntityTable<Settings, "id">;
  kv!: EntityTable<KV, "key">;

  constructor(name = "fast-and-move") {
    super(name);
    // Version 1. Add new versions below with .upgrade() for migrations; never edit a shipped one.
    this.version(1).stores({
      fasts: "id, status, startAt, endAt, updatedAt",
      intake: "id, at, fastId, kind, updatedAt",
      favorites: "id, sort, updatedAt",
      workoutLogs: "id, templateId, date, startedAt, updatedAt",
      progression: "id, &exerciseId, updatedAt",
      bodyMetrics: "id, at, updatedAt",
      readiness: "id, &date, updatedAt",
      insights: "id, episodeId, source, updatedAt",
      episodeNotes: "id, &episodeId, updatedAt",
      settings: "id",
      kv: "key",
    });
  }
}

export const USER_TABLES = [
  "fasts",
  "intake",
  "favorites",
  "workoutLogs",
  "progression",
  "bodyMetrics",
  "readiness",
  "insights",
  "episodeNotes",
  "settings",
  "kv",
] as const;

export type UserTable = (typeof USER_TABLES)[number];

let instance: FastMoveDB | null = null;

export function db(): FastMoveDB {
  if (!instance) instance = new FastMoveDB();
  return instance;
}

/** For tests: swap in a fresh database. */
export function setDb(next: FastMoveDB): void {
  instance = next;
}
