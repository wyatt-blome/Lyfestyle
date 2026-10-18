"use client";
import type { ReactNode } from "react";
import { useActiveFast } from "@/client/fasts";
import { useNow } from "@/client/useNow";
import { allowedDuringLongFast, longFastActive } from "@/lib/fasting";
import type { SessionId } from "@/lib/types";
import { LinkButton, Notice, Page } from "../kit";
import { WhyCards } from "../WhyCard";

/** Hard sessions are off past 24 h fasted, however the screen was reached (URL, Resume). */
export function LongFastBlock({ id, children }: { id: SessionId; children: ReactNode }) {
  const fast = useActiveFast();
  const now = useNow(60_000);
  if (fast === undefined) return null;
  if (longFastActive(fast ?? undefined, now) && !allowedDuringLongFast(id)) {
    return (
      <Page title="Not today" back="/train">
        <Notice tone="bad">You&apos;re in a fast over 24 h. Hard sessions are off: do M, Z or the Daily 10 instead.</Notice>
        <WhyCards keys={["training:during-fast"]} />
        <LinkButton href="/train/session?id=M&v=easy" variant="primary" big>
          M · Mobility &amp; Core
        </LinkButton>
        <LinkButton href="/train/session?id=Z&v=easy" big>
          Z · Ranch Zone 2
        </LinkButton>
      </Page>
    );
  }
  return <>{children}</>;
}

