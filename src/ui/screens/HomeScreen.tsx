"use client";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { useActiveFast } from "@/client/fasts";
import { useSettings } from "@/client/settings";
import { useTodayPlan } from "@/client/today";
import { useNow } from "@/client/useNow";
import { db } from "@/db/db";
import { backupDue } from "@/lib/backup";
import { progress, protocolDef } from "@/lib/fasting";
import { formatTime } from "@/lib/time";
import { cardsFor, protocolKeys } from "@/lib/why";
import { whyCards } from "@/seed";
import { QuickDrinks, useFastFlows } from "../FastFlows";
import { FastRing } from "../FastRing";
import { Card, LinkButton, Notice } from "../kit";
import { TodayCard } from "../TodayCard";
import { WhyTeaser } from "../WhyCard";

export function HomeScreen() {
  const now = useNow();
  const settings = useSettings();
  const fast = useActiveFast();
  const plan = useTodayPlan(settings, now);
  const { requestEnd } = useFastFlows();
  // null = no fasts yet (useLiveQuery returns undefined only while loading).
  const firstUse = useLiveQuery(async () => (await db().fasts.orderBy("startAt").first())?.createdAt ?? null, []);

  const protocol = fast?.protocol ?? settings?.defaultProtocol ?? "16:8";
  const teaser = cardsFor(whyCards, protocolKeys(protocol, fast?.targetHours ?? protocolDef(protocol).targetHours))[0];

  const loading = !settings || fast === undefined || !plan || firstUse === undefined;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-safe">
      <header className="flex min-h-12 items-center justify-between">
        <h1 className="text-2xl font-bold">Fast &amp; Move</h1>
        <Link href="/settings" className="btn inline-flex min-h-12 min-w-12 items-center justify-center text-2xl text-muted" aria-label="Settings">
          ⚙
        </Link>
      </header>

      {/* Everything below reads IndexedDB; it renders together so nothing jumps as it arrives. */}
      {!loading && (
        <>
          {settings && backupDue(settings.lastBackupAt, firstUse ?? undefined, now) && (
            <Notice tone="info">
              No backup in 7+ days.{" "}
              <Link href="/settings#backup" className="btn inline-flex min-h-12 items-center font-semibold underline">
                Export a backup
              </Link>
            </Notice>
          )}

          <Card>
            {fast ? (
              <ActiveFast fastNow={now} />
            ) : (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <p className="text-muted">Not fasting</p>
                <p className="text-3xl font-bold">{settings ? protocolDef(settings.defaultProtocol).label : "16:8"} next</p>
                <LinkButton href="/fast" variant="primary" big className="w-full">
                  Start a fast
                </LinkButton>
              </div>
            )}
            {fast && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <LinkButton href="/fast">Details</LinkButton>
                <button
                  type="button"
                  className="min-h-12 rounded-2xl border border-line bg-surface-2 text-lg"
                  onClick={() => requestEnd(fast)}
                >
                  End fast
                </button>
              </div>
            )}
          </Card>

          <LinkButton href="/train/quick" variant="primary" big className="min-h-20 text-2xl">
            ⚡ Quick 20
          </LinkButton>

          {plan && <TodayCard plan={plan} fast={fast} now={now} />}

          <Card title={fast ? "Fast-safe drinks" : "Quick add"}>
            <QuickDrinks />
          </Card>

          {teaser && <WhyTeaser card={teaser} />}
        </>
      )}
    </main>
  );
}

function ActiveFast({ fastNow }: { fastNow: number }) {
  const fast = useActiveFast();
  if (!fast) return null;
  const p = progress(fast, fastNow);
  return (
    <div className="flex flex-col items-center gap-2">
      <FastRing {...p} size={240} caption={`${fast.protocol} fast`} />
      <p className="text-base text-muted">
        Target {fast.targetHours} h · ends {formatTime(p.projectedEnd)}
      </p>
    </div>
  );
}
