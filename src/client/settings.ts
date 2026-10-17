"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/db";
import { dateKey, deviceTz } from "@/lib/time";
import type { Settings } from "@/lib/types";

export function defaultSettings(now = new Date()): Settings {
  return {
    id: "settings",
    units: "imperial",
    age: 45,
    defaultProtocol: "16:8",
    customHours: 16,
    tz: deviceTz(),
    // The day the app is first opened. Weeks count from that week's Monday; the missed-Wednesday
    // rule only looks at days on or after it.
    rotationStartDate: dateKey(now),
    bellsLb: [10, 15, 40],
    dumbbellsLb: [],
    notifications: { halfway: true, target: true, windowClosing: true, sound: true, voice: false, vibrate: true },
    onboarded: false,
    updatedAt: now.toISOString(),
  };
}

export async function getSettings(): Promise<Settings> {
  const s = await db().settings.get("settings");
  if (s) return { ...defaultSettings(), ...s };
  const fresh = defaultSettings();
  await db().settings.put(fresh);
  return fresh;
}

export async function saveSettings(changes: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  await db().settings.put({ ...current, ...changes, id: "settings", updatedAt: new Date().toISOString() });
}

/** Live settings; undefined while loading. */
export function useSettings(): Settings | undefined {
  return useLiveQuery(async () => {
    const s = await db().settings.get("settings");
    return s ? { ...defaultSettings(), ...s } : defaultSettings();
  }, []);
}
