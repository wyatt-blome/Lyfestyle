"use client";
import { db, USER_TABLES } from "@/db/db";
import { backupFileName, makeBackup, parseBackup } from "@/lib/backup";
import { saveSettings } from "./settings";
import { resetSyncCursors, settleSync, signOut } from "./sync";

export async function exportAll(): Promise<{ blob: Blob; fileName: string }> {
  const d = db();
  const now = new Date();
  // Stamp the backup time first, so the file itself records it and a restore doesn't
  // immediately say "No backup in 7+ days".
  await saveSettings({ lastBackupAt: now.toISOString() });
  const tables: Record<string, unknown[]> = {};
  await d.transaction("r", USER_TABLES.map((t) => d.table(t)), async () => {
    for (const t of USER_TABLES) tables[t] = await d.table(t).toArray();
  });
  const backup = makeBackup(tables, now.toISOString());
  const blob = new Blob([JSON.stringify(backup, null, 1)], { type: "application/json" });
  return { blob, fileName: backupFileName(now) };
}

export async function downloadBackup(): Promise<void> {
  const { blob, fileName } = await exportAll();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Replaces everything on this device with the backup's contents. */
export async function importAll(text: string): Promise<number> {
  const backup = parseBackup(text, USER_TABLES);
  const d = db();
  // Stop a sync in flight first so it can't write pulled rows over the restored ones.
  resetSyncCursors();
  await settleSync();
  let count = 0;
  await d.transaction("rw", USER_TABLES.map((t) => d.table(t)), async () => {
    for (const t of USER_TABLES) {
      await d.table(t).clear();
      const rows = backup.tables[t] ?? [];
      if (rows.length) await d.table(t).bulkPut(rows);
      count += rows.length;
    }
  });
  // Push the restored rows and re-pull everything on the next sync.
  resetSyncCursors();
  return count;
}

export async function wipeAll(): Promise<void> {
  const d = db();
  // Erasing this phone also signs it out of sync, or the next sync would bring everything back.
  // Sign out first and let a sync in flight stop, so it can't write rows after the clear.
  signOut();
  await settleSync();
  await d.transaction("rw", USER_TABLES.map((t) => d.table(t)), async () => {
    for (const t of USER_TABLES) await d.table(t).clear();
  });
  resetSyncCursors();
}

/** Ask the browser not to evict our data. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
