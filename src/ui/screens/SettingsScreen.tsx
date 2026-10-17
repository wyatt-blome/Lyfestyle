"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { downloadBackup, importAll, wipeAll } from "@/client/backup";
import { saveSettings, useSettings } from "@/client/settings";
import { PROTOCOLS } from "@/lib/fasting";
import { formatDayTime } from "@/lib/time";
import type { NotificationPrefs, ProtocolId } from "@/lib/types";
import { Button, Card, Check, Field, Page } from "../kit";
import { PushSettings } from "../PushSettings";
import { SyncSettings } from "../SyncSettings";
import { useToast } from "../Toast";

function parseList(s: string): number[] {
  return [...new Set(s.split(/[ ,]+/).map(Number).filter((n) => n > 0 && n < 400))].sort((a, b) => a - b);
}

export function SettingsScreen() {
  const s = useSettings();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [bells, setBells] = useState<string | null>(null);
  const [dbs, setDbs] = useState<string | null>(null);
  if (!s) return <Page title="Settings" back="/more">{null}</Page>;

  const setNotif = (k: keyof NotificationPrefs, v: boolean) => saveSettings({ notifications: { ...s.notifications, [k]: v } });
  const hrMax = Math.round(211 - 0.64 * s.age);

  return (
    <Page title="Settings" back="/more">
      <Card title="You">
        <Field label="Age" hint={`HRmax ≈ ${hrMax} bpm`}>
          <input
            inputMode="numeric"
            defaultValue={s.age}
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (n > 10 && n < 110) void saveSettings({ age: n });
            }}
          />
        </Field>
        <p className="mt-2 text-sm text-muted">Time zone: {s.tz} (from this device)</p>
      </Card>

      <Card title="Fasting">
        <Field label="Default protocol">
          <select value={s.defaultProtocol} onChange={(e) => void saveSettings({ defaultProtocol: e.target.value as ProtocolId })}>
            {PROTOCOLS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card title="Training">
        <Field label="Rotation start (week 1 is the week of this date)">
          <input
            type="date"
            value={s.rotationStartDate}
            onChange={(e) => e.target.value && void saveSettings({ rotationStartDate: e.target.value })}
          />
        </Field>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Kettlebells (lb)">
            <input
              value={bells ?? s.bellsLb.join(", ")}
              onChange={(e) => setBells(e.target.value)}
              onBlur={() => {
                if (bells !== null) void saveSettings({ bellsLb: parseList(bells) });
                setBells(null);
              }}
            />
          </Field>
          <Field label="Dumbbells (lb)">
            <input
              value={dbs ?? s.dumbbellsLb.join(", ")}
              placeholder="e.g. 20, 25, 35"
              onChange={(e) => setDbs(e.target.value)}
              onBlur={() => {
                if (dbs !== null) void saveSettings({ dumbbellsLb: parseList(dbs) });
                setDbs(null);
              }}
            />
          </Field>
        </div>
      </Card>

      <Card title="Reminders">
        <p className="mb-2 text-base text-muted">Shown in the app while it&apos;s open. For reminders when it&apos;s closed, turn on background reminders below.</p>
        <Check checked={s.notifications.halfway} onChange={(v) => void setNotif("halfway", v)}>
          Halfway through a fast
        </Check>
        <Check checked={s.notifications.target} onChange={(v) => void setNotif("target", v)}>
          Target reached
        </Check>
        <Check checked={s.notifications.windowClosing} onChange={(v) => void setNotif("windowClosing", v)}>
          Eating window closes in 30 min
        </Check>
        <Check checked={s.notifications.vibrate} onChange={(v) => void setNotif("vibrate", v)}>
          Vibrate
        </Check>
        <Check checked={s.notifications.sound} onChange={(v) => void setNotif("sound", v)}>
          Workout beeps
        </Check>
        <Check checked={s.notifications.voice} onChange={(v) => void setNotif("voice", v)}>
          Spoken workout cues
        </Check>
        {typeof Notification !== "undefined" && Notification.permission === "default" && (
          <Button className="mt-2 w-full" onClick={() => void Notification.requestPermission()}>
            Allow system notifications
          </Button>
        )}
      </Card>

      <PushSettings />

      <Card title="Backup" className="scroll-mt-4">
        <div id="backup" />
        <p className="mb-3 text-base text-muted">
          Everything lives on this phone. Last backup: {s.lastBackupAt ? formatDayTime(s.lastBackupAt) : "never"}.
        </p>
        <div className="flex flex-col gap-3">
          <Button variant="primary" onClick={() => void downloadBackup().then(() => toast("Backup saved", "good"))}>
            Export backup (JSON)
          </Button>
          <Button onClick={() => file.current?.click()}>Import backup…</Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (!confirm("Importing replaces everything on this phone with the backup. Continue?")) return;
              try {
                const n = await importAll(await f.text());
                toast(`Restored ${n} records`, "good");
              } catch (err) {
                toast((err as Error).message, "bad");
              }
            }}
          />
          <Button
            variant="danger"
            onClick={async () => {
              if (!confirm("Erase every fast, log and setting on this phone? Export a backup first.")) return;
              if (!confirm("Really erase everything?")) return;
              await wipeAll();
              toast("Everything erased", "info");
            }}
          >
            Erase all data
          </Button>
        </div>
      </Card>

      <SyncSettings />

      <Link href="/settings/credits" className="btn flex min-h-12 items-center justify-center rounded-2xl bg-surface text-lg">
        Credits
      </Link>
    </Page>
  );
}
