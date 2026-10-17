"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useActiveFast } from "@/client/fasts";
import { useDeloadReasons } from "@/client/sessionPlan";
import { useSettings } from "@/client/settings";
import { useTodayPlan } from "@/client/today";
import { useNow } from "@/client/useNow";
import { useActiveRun, useDraft } from "@/client/workouts";
import { allowedDuringLongFast, longFastActive } from "@/lib/fasting";
import { defaultEasy } from "@/lib/session";
import { exerciseById, sessions } from "@/seed";
import { Badge, Button, Card, LinkButton, Notice, Page } from "../kit";
import { mediaUrls, warmMedia } from "../LoopedDemo";
import { ReadinessCard } from "../ReadinessCard";
import { effectiveSession, sessionLabel } from "../TodayCard";
import { startHref } from "../train/useQuery";
import { WhyCards } from "../WhyCard";

export function TrainScreen() {
  const now = useNow(30_000);
  const router = useRouter();
  const settings = useSettings();
  const fast = useActiveFast();
  const plan = useTodayPlan(settings, now);
  const reasons = useDeloadReasons(now) ?? [];
  const draft = useDraft();
  const run = useActiveRun();
  const restricted = longFastActive(fast ?? undefined, now);
  const visible = sessions.filter((s) => !restricted || allowedDuringLongFast(s.id));
  const eff = plan ? effectiveSession(plan, fast, now) : null;
  const session = eff?.session ?? null;
  const deload = reasons.length > 0;

  // Cache today's demos so the session works offline.
  useEffect(() => {
    if (!session) return;
    const ids = new Set(session.blocks.flatMap((b) => b.items.map((i) => i.exerciseId)));
    warmMedia([...ids].flatMap((id) => (exerciseById.get(id) ? mediaUrls(exerciseById.get(id)!) : [])));
  }, [session]);

  return (
    <Page title="Train">
      {(draft || run) && (
        <Notice tone="info">
          A session is in progress.{" "}
          <Link
            className="underline"
            href={draft ? `/train/log?id=${draft.templateId}&v=${draft.variant}&d=${draft.deload ? 1 : 0}` : run!.kind === "quick" ? "/train/quick" : run!.kind === "4x4" ? "/train/4x4" : "/train/follow"}
          >
            Resume
          </Link>
        </Notice>
      )}

      {plan && (
        <Card
          title="Today"
          action={
            <span className="flex gap-2">
              <Badge>Week {plan.week.cycleWeek}/6</Badge>
              {deload && <Badge tone="info">Deload</Badge>}
            </span>
          }
        >
          {session ? (
            <div className="flex flex-col gap-3">
              <Link href={`/train/session?id=${session.id}`} className="block">
                <p className="text-2xl font-bold">{sessionLabel(session)}</p>
                <p className="text-muted">
                  {session.fullMin} min · short {session.shortMin} min
                </p>
                <p>{session.summary}</p>
              </Link>
              {plan.reason && <Notice tone="info">{plan.reason}</Notice>}
              {eff?.restricted && eff.planned && <Notice>Past 24 h fasted: {sessionLabel(eff.planned)} is swapped for an easy day.</Notice>}
              {deload && <p className="text-base text-info">Deload: {reasons.join(" · ")}. ~60% of the sets, nothing to failure.</p>}
              <Button variant="primary" big onClick={() => router.push(startHref(session.id, "full", deload))}>
                Start
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => router.push(`/train/session?id=${session.id}&v=short`)} disabled={session.fullMin === session.shortMin}>
                  Short Day ({session.shortMin} min)
                </Button>
                <Button onClick={() => router.push(`/train/session?id=${defaultEasy(session.id)}&v=easy`)}>Easy Day</Button>
              </div>
              <LinkButton href={`/train/session?id=${session.id}`}>See every move</LinkButton>
              {plan.alternative && (
                <LinkButton href={`/train/session?id=${plan.alternative}`}>Or: {sessionLabel(sessions.find((s) => s.id === plan.alternative)!)}</LinkButton>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-2xl font-bold">Rest day</p>
              <LinkButton href="/train/session?id=DAILY10" variant="primary" big>
                Optional: Daily 10
              </LinkButton>
            </div>
          )}
        </Card>
      )}

      <ReadinessCard />

      {!restricted && (
        <LinkButton href="/train/quick" variant="primary" big className="min-h-20 text-2xl">
          ⚡ Quick 20
        </LinkButton>
      )}

      {restricted && (
        <>
          <Notice>Long fast in progress: only easy options (M, Z, Daily 10). The 4×4, Q5 and heavy carries are hidden.</Notice>
          <WhyCards keys={["training:during-fast"]} />
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <LinkButton href="/train/program">Program</LinkButton>
        <LinkButton href="/train/exercises">Exercises</LinkButton>
      </div>

      <Card title={restricted ? "Easy options" : "All sessions"}>
        <ul className="flex flex-col divide-y divide-line">
          {visible.map((s) => (
            <li key={s.id}>
              <Link href={`/train/session?id=${s.id}`} className="btn flex min-h-14 items-center justify-between gap-2 py-3">
                <span>
                  <span className="block text-lg">{sessionLabel(s)}</span>
                  <span className="text-sm text-muted">{s.summary}</span>
                </span>
                <Badge>{s.fullMin} min</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
