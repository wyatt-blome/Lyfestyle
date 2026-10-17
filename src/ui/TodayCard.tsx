"use client";
import { allowedDuringLongFast, longFastActive } from "@/lib/fasting";
import type { TodayPlan } from "@/lib/rotation";
import type { Fast, SessionId, SessionTemplate } from "@/lib/types";
import { sessions } from "@/seed";
import { Badge, Card, LinkButton, Notice } from "./kit";

export const sessionById = new Map(sessions.map((s) => [s.id, s]));

export function sessionLabel(s: SessionTemplate): string {
  return s.id.startsWith("Q") || s.id === "DAILY10" ? s.name : `${s.id} · ${s.name}`;
}

/** The session to show today, after the fasting safety rule. */
export function effectiveSession(
  plan: TodayPlan,
  fast: Fast | null | undefined,
  now: number,
): { session: SessionTemplate | null; restricted: boolean; planned: SessionTemplate | null } {
  const planned = plan.sessionId === "REST" ? null : (sessionById.get(plan.sessionId) ?? null);
  if (planned && longFastActive(fast ?? undefined, now) && !allowedDuringLongFast(planned.id)) {
    return { session: sessionById.get("M")!, restricted: true, planned };
  }
  return { session: planned, restricted: false, planned };
}

export function TodayCard({ plan, fast, now }: { plan: TodayPlan; fast: Fast | null | undefined; now: number }) {
  const { session, restricted, planned } = effectiveSession(plan, fast, now);
  const optional = plan.optional ? sessionById.get(plan.optional) : undefined;
  return (
    <Card
      title="Today"
      action={
        <span className="flex gap-2">
          <Badge>
            Week {plan.week.cycleWeek} of 6
          </Badge>
          {plan.week.deload && <Badge tone="info">Deload</Badge>}
        </span>
      }
    >
      {session ? (
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-bold">{sessionLabel(session)}</p>
          <p className="text-muted">
            {session.fullMin} min · short {session.shortMin} min
          </p>
          <p>{session.summary}</p>
          {plan.reason && <Notice tone="info">{plan.reason}</Notice>}
          {restricted && planned && (
            <Notice>
              You&apos;re past 24 h fasted, so {sessionLabel(planned)} is swapped for an easy day. Only M, Z or the Daily 10
              today.
            </Notice>
          )}
          {plan.week.deload && <p className="text-base text-info">Deload week: about 60% of the sets, nothing to failure.</p>}
          <LinkButton href="/train" variant="primary" big className="mt-1">
            Open session
          </LinkButton>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-2xl font-bold">Rest day</p>
          {optional && <p className="text-muted">Optional: {optional.name} ({optional.fullMin} min).</p>}
          <LinkButton href="/train" className="mt-1">
            See the Daily 10
          </LinkButton>
        </div>
      )}
    </Card>
  );
}

export function isSessionId(s: string): s is SessionId {
  return sessionById.has(s as SessionId);
}
