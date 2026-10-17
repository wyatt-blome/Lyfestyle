"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useActiveFast } from "@/client/fasts";
import { useDeloadReasons, useSessionPlan } from "@/client/sessionPlan";
import { useNow } from "@/client/useNow";
import { useLastLog } from "@/client/workouts";
import { allowedDuringLongFast, longFastActive } from "@/lib/fasting";
import { quickScoreOf } from "@/lib/progression";
import { defaultEasy, EASY_OPTIONS, fastTimingNote } from "@/lib/session";
import { formatDayTime } from "@/lib/time";
import { exerciseById } from "@/seed";
import { Badge, Button, Card, Check, LinkButton, Notice, Page, Sheet } from "../kit";
import { mediaUrls, warmMedia } from "../LoopedDemo";
import { sessionLabel } from "../TodayCard";
import { ExerciseItem } from "../train/ExerciseItem";
import { startHref, useSessionQuery } from "../train/useQuery";
import { WhyCards } from "../WhyCard";
import { sessionById } from "@/client/sessionPlan";

export function SessionScreen() {
  const { id, variant: qVariant, deload: qDeload } = useSessionQuery();
  const router = useRouter();
  const now = useNow(30_000);
  const fast = useActiveFast();
  const [variant, setVariant] = useState(qVariant);
  const [manualDeload, setManualDeload] = useState(false);
  const reasons = useDeloadReasons(now, manualDeload) ?? [];
  const deload = qDeload ?? reasons.length > 0;
  const plan = useSessionPlan(id, variant, deload, reasons);
  const last = useLastLog(id);
  const [easyOpen, setEasyOpen] = useState(false);

  useEffect(() => {
    if (!plan) return;
    const ids = new Set(plan.blocks.flatMap((b) => b.items.map((i) => i.exerciseId)));
    warmMedia([...ids].flatMap((x) => (exerciseById.get(x) ? mediaUrls(exerciseById.get(x)!) : [])));
  }, [plan]);

  if (!id) return <Page title="Session" back="/train"><p className="text-muted">Pick a session from Train.</p></Page>;
  if (!plan) return <Page title="Session" back="/train">{null}</Page>;
  const t = plan.template;
  const blocked = longFastActive(fast ?? undefined, now) && !allowedDuringLongFast(t.id);
  const timing = fastTimingNote(fast, !!t.hard);
  const minutes = variant === "short" ? t.shortMin : t.fullMin;

  return (
    <Page title={sessionLabel(t)} back="/train">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{minutes} min</Badge>
        {variant === "short" && <Badge tone="info">Short Day</Badge>}
        {deload && <Badge tone="info">Deload: ~60% of sets</Badge>}
      </div>
      <WhyCards ids={t.whyCardIds} />
      {fast && t.hard && <WhyCards keys={["training:during-fast"]} />}

      {blocked && (
        <Notice tone="bad">You&apos;re in a long fast. Hard sessions are off: do M, Z or the Daily 10 instead.</Notice>
      )}
      {timing && <Notice tone="info">{timing}</Notice>}
      {deload && plan.deloadReasons.length > 0 && (
        <Notice tone="info">
          Deload: {plan.deloadReasons.join(" · ")}. Nothing to failure.
          <WhyCards ids={["why-deload-sleep"]} />
        </Notice>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="primary"
          big
          disabled={blocked}
          onClick={() => router.push(startHref(t.id, variant, deload))}
          className="col-span-3"
        >
          Start {variant === "short" ? "Short Day" : ""}
        </Button>
        <Button onClick={() => setVariant(variant === "short" ? "full" : "short")} disabled={t.fullMin === t.shortMin}>
          {variant === "short" ? "Full" : "Short Day"}
        </Button>
        <Button onClick={() => setEasyOpen(true)}>Easy Day</Button>
        <LinkButton href="/train/quick">Quick 20</LinkButton>
      </div>
      {!qDeload && !reasons.includes("Deload week (every 6th week)") && (
        <Check checked={manualDeload} onChange={setManualDeload}>
          Ill, or under 6 h sleep two nights running (deload today)
        </Check>
      )}

      {last && (
        <p className="text-base text-muted">
          Last time: {formatDayTime(last.startedAt)}
          {last.quick ? ` · score ${quickScoreOf(last)}` : ""}
          {last.rpe ? ` · RPE ${last.rpe}` : ""}
        </p>
      )}

      {plan.blocks.map((b, bi) => (
        <Card key={`${b.label}-${bi}`} title={b.rounds && b.rounds > 1 ? `${b.label} · ${b.rounds} rounds` : b.label}>
          <ul className="flex flex-col divide-y divide-line">
            {b.items.map((item, ii) => (
              <ExerciseItem
                key={`${item.exerciseId}-${ii}`}
                item={item}
                rounds={b.rounds}
                restSec={b.restSec}
                templateId={t.id}
                original={plan.meta[bi][ii].original}
                sessionSwap={t.swaps[plan.meta[bi][ii].original]}
                stageLabel={plan.meta[bi][ii].stageLabel}
              />
            ))}
          </ul>
        </Card>
      ))}
      {t.progressionNote && <p className="text-base text-muted">Progress: {t.progressionNote}</p>}
      <Link href="/train/program" className="btn flex min-h-12 items-center justify-center rounded-2xl bg-surface text-lg">
        Program &amp; stages
      </Link>

      <Sheet open={easyOpen} onClose={() => setEasyOpen(false)} title="Easy Day">
        <div className="flex flex-col gap-2">
          {[defaultEasy(t.id), ...EASY_OPTIONS.filter((e) => e !== defaultEasy(t.id))].map((e, i) => {
            const s = sessionById.get(e)!;
            return (
              <Button key={e} big variant={i === 0 ? "primary" : "secondary"} onClick={() => router.push(`/train/session?id=${e}&v=easy`)}>
                {sessionLabel(s)} · {s.fullMin} min
              </Button>
            );
          })}
        </div>
      </Sheet>
    </Page>
  );
}
