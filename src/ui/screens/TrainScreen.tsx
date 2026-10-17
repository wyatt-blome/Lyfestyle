"use client";
// Phase 1: today's session from the rotation, with the long-fast safety rule applied. The session
// list, demos, logger and timers arrive in Phase 2.
import { useActiveFast } from "@/client/fasts";
import { useSettings } from "@/client/settings";
import { useTodayPlan } from "@/client/today";
import { useNow } from "@/client/useNow";
import { allowedDuringLongFast, longFastActive } from "@/lib/fasting";
import { sessions } from "@/seed";
import { Badge, Card, Notice, Page } from "../kit";
import { sessionLabel, TodayCard } from "../TodayCard";
import { WhyCards } from "../WhyCard";

export function TrainScreen() {
  const now = useNow(30_000);
  const settings = useSettings();
  const fast = useActiveFast();
  const plan = useTodayPlan(settings, now);
  const restricted = longFastActive(fast ?? undefined, now);
  const visible = sessions.filter((s) => !restricted || allowedDuringLongFast(s.id));

  return (
    <Page title="Train">
      {plan && <TodayCard plan={plan} fast={fast} now={now} />}
      {restricted && (
        <>
          <Notice>Long fast in progress: only easy options (M, Z, Daily 10). The 4×4, Q5 and heavy carries are hidden.</Notice>
          <WhyCards keys={["training:during-fast"]} />
        </>
      )}
      <Card title={restricted ? "Easy options" : "All sessions"}>
        <ul className="flex flex-col divide-y divide-line">
          {visible.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-3">
              <span>
                <span className="block text-lg">{sessionLabel(s)}</span>
                <span className="text-sm text-muted">{s.summary}</span>
              </span>
              <Badge>{s.fullMin} min</Badge>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-sm text-muted">Session lists with looped demos, the logger, Quick 20 timers and the 4×4 runner arrive in Phase 2.</p>
    </Page>
  );
}
