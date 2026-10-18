"use client";
// In-app reminders (MVP): checked while the app is open and whenever it returns to the
// foreground. Web push for installed PWAs comes in Phase 4.
import { useEffect } from "react";
import { dueReminders, type ReminderKind } from "@/lib/fasting";
import { useToast } from "@/ui/Toast";
import { markReminder, useFasts } from "./fasts";
import { useSettings } from "./settings";
import { useNow } from "./useNow";

const PREF: Record<ReminderKind, "halfway" | "target" | "windowClosing"> = {
  halfway: "halfway",
  target: "target",
  window: "windowClosing",
};

export function ReminderWatcher() {
  const fasts = useFasts();
  const settings = useSettings();
  const now = useNow(30_000);
  const toast = useToast();

  useEffect(() => {
    if (!fasts || !settings) return;
    // Only look at recent fasts; old ones can't have a reminder due.
    const recent = fasts.slice(0, 5);
    for (const r of dueReminders(recent, now)) {
      void markReminder(r.fastId, r.kind);
      if (!settings.notifications[PREF[r.kind]]) continue;
      toast(r.message, "good");
      if (settings.notifications.vibrate) navigator.vibrate?.(200);
      void systemNotify(r.message);
    }
  }, [fasts, settings, now, toast]);

  return null;
}

async function systemNotify(body: string): Promise<void> {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification("Fast & Move", { body, icon: "/icons/icon-192.png", tag: "fast" });
    else new Notification("Fast & Move", { body });
  } catch {
    // Notifications are best-effort.
  }
}
