"use client";
import { useEffect, useState } from "react";
import { fetchEmail, saveSession, sendMagicLink, signOut, SYNC_AVAILABLE, syncNow, useSyncStatus } from "@/client/sync";
import { authError, parseAuthHash } from "@/lib/sync";
import { formatDayTime } from "@/lib/time";
import { Button, Card, Field, Notice } from "./kit";
import { useToast } from "./Toast";

/** Settings card for the optional Supabase sync, and the magic-link landing (#access_token=…). */
export function SyncSettings() {
  const status = useSyncStatus();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!SYNC_AVAILABLE || !window.location.hash) return;
    const hash = window.location.hash;
    const err = authError(hash);
    const session = parseAuthHash(hash, Date.now());
    if (session || err) history.replaceState(null, "", window.location.pathname);
    if (err) toast(`Sign-in failed: ${err}`, "bad");
    if (session) {
      saveSession(session);
      void fetchEmail().then(() => syncNow());
      toast("Signed in. Syncing…", "good");
    }
  }, [toast]);

  if (!SYNC_AVAILABLE) {
    return (
      <Card title="Sync">
        <p className="text-base text-muted">
          Off. Everything stays on this phone. To sync between devices, set up a free Supabase project (README → Optional
          sync).
        </p>
      </Card>
    );
  }

  return (
    <Card title="Sync">
      {status.signedIn ? (
        <div className="flex flex-col gap-3">
          <p className="text-base">Signed in{status.email ? ` as ${status.email}` : ""}. Syncs on open, every 5 min, and when you come back to the app.</p>
          {status.last && (
            <Notice tone={status.last.ok ? "info" : "bad"}>
              {formatDayTime(status.last.at)}: {status.last.message}
            </Notice>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="primary" disabled={status.busy} onClick={() => void syncNow()}>
              {status.busy ? "Syncing…" : "Sync now"}
            </Button>
            <Button
              onClick={() => {
                if (confirm("Sign out of sync? Data on this phone stays.")) signOut();
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      ) : sent ? (
        <p className="text-base">Check your email for the sign-in link, and open it on this device.</p>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await sendMagicLink(email.trim());
              setSent(true);
            } catch (err) {
              toast((err as Error).message, "bad");
            }
          }}
        >
          <p className="text-base text-muted">Optional. Sign in with a magic link to sync between devices. The app works fully without it.</p>
          <Field label="Email">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" disabled={!email.includes("@")}>
            Send sign-in link
          </Button>
        </form>
      )}
    </Card>
  );
}
