"use client";
// Settings card for background reminders (web push). In-app reminders work without it.
import { useCallback, useEffect, useState } from "react";
import { disablePush, enablePush, pushConfig, pushState, sendTestPush, type PushState } from "@/client/push";
import { Badge, Button, Card, Notice } from "./kit";
import { useToast } from "./Toast";

const LABEL: Record<PushState, { text: string; tone: "muted" | "warn" | "bad" | "good" }> = {
  unsupported: { text: "Not supported", tone: "muted" },
  "needs-install": { text: "Install first", tone: "warn" },
  denied: { text: "Blocked", tone: "bad" },
  off: { text: "Off", tone: "muted" },
  on: { text: "On", tone: "good" },
};

export function PushSettings() {
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [setUp, setSetUp] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(
    () =>
      Promise.all([pushState(), pushConfig()]).then(([s, cfg]) => {
        setState(s);
        setSetUp(cfg.ok);
      }),
    [],
  );

  useEffect(() => {
    let live = true;
    void Promise.all([pushState(), pushConfig()]).then(([s, cfg]) => {
      if (!live) return;
      setState(s);
      setSetUp(cfg.ok);
    });
    return () => {
      live = false;
    };
  }, []);

  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, done: string) => {
    setBusy(true);
    try {
      const r = await fn();
      if (r.ok) toast(done, "good");
      else toast(r.error, "bad");
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  return (
    <Card title="Background reminders" action={state && <Badge tone={LABEL[state].tone}>{LABEL[state].text}</Badge>}>
      <div className="flex flex-col gap-3">
        <p className="text-base text-muted">
          Halfway, target and “eating window closes in 30 min” arrive even when the app is closed. On iPhone this needs
          iOS 16.4 or later and the app added to the Home Screen (Share → Add to Home Screen), then opened from there.
        </p>

        {setUp === false && <Notice tone="info">Push isn&apos;t set up on the server yet, so only in-app reminders work.</Notice>}
        {state === "needs-install" && (
          <Notice>Open Fast &amp; Move from your Home Screen to turn this on. Safari tabs can&apos;t get background reminders.</Notice>
        )}
        {state === "unsupported" && <Notice tone="info">This browser can&apos;t do background reminders. In-app reminders still work.</Notice>}
        {state === "denied" && (
          <Notice tone="bad">Notifications are blocked for this app. Allow them in the system settings, then come back.</Notice>
        )}

        {state === "on" ? (
          <div className="grid grid-cols-2 gap-3">
            <Button disabled={busy} onClick={() => void run(sendTestPush, "Test sent. It should arrive in a few seconds.")}>
              Send test
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void run(disablePush, "Background reminders off.")}>
              Turn off
            </Button>
          </div>
        ) : (
          <Button
            variant="primary"
            big
            disabled={busy || state !== "off" || setUp !== true}
            onClick={() => void run(enablePush, "Background reminders on.")}
          >
            Turn on background reminders
          </Button>
        )}
        <p className="text-sm text-muted">Which reminders you get follows your notification toggles. Reminders are scheduled up to 7 days ahead.</p>
      </div>
    </Card>
  );
}
