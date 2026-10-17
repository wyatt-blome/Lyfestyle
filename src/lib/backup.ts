// JSON export/import of every personal record. Pure; the device code reads and writes Dexie.

export const BACKUP_FORMAT = "fast-and-move-backup";
export const BACKUP_VERSION = 1;
export const BACKUP_REMIND_DAYS = 7;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export function makeBackup(tables: Record<string, unknown[]>, exportedAt: string): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt, tables };
}

export function parseBackup(text: string, knownTables: readonly string[]): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (!data || typeof data !== "object") throw new Error("That file is not a Fast & Move backup.");
  const b = data as Partial<Backup>;
  if (b.format !== BACKUP_FORMAT) throw new Error("That file is not a Fast & Move backup.");
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) {
    throw new Error("This backup is from a newer version of the app. Update the app first.");
  }
  if (!b.tables || typeof b.tables !== "object") throw new Error("The backup has no tables.");
  const tables: Record<string, unknown[]> = {};
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!knownTables.includes(name)) continue;
    if (!Array.isArray(rows)) throw new Error(`Table ${name} is not a list.`);
    tables[name] = rows;
  }
  return { format: BACKUP_FORMAT, version: b.version, exportedAt: String(b.exportedAt ?? ""), tables };
}

export function backupDue(lastBackupAt: string | undefined, firstUseAt: string | undefined, now: number): boolean {
  const ref = lastBackupAt ?? firstUseAt;
  if (!ref) return false;
  return now - Date.parse(ref) > BACKUP_REMIND_DAYS * 86_400_000;
}

export function backupFileName(now: Date): string {
  return `fast-and-move-backup-${now.toISOString().slice(0, 10)}.json`;
}
