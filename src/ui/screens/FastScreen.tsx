"use client";
import Link from "next/link";
import { useState } from "react";
import { editFast, startFast, useActiveFast, useFasts } from "@/client/fasts";
import { totals, useIntakeBetween } from "@/client/intake";
import { saveSettings, useSettings } from "@/client/settings";
import { useNow } from "@/client/useNow";
import {
  DISCLAIMER,
  EXTENDED_WARNING,
  isExtended,
  progress,
  protocolSuggestion,
  PROTOCOLS,
  requiresDoctorAck,
  STAGE_CAVEAT,
  STAGES,
  stageIndexAt,
  targetHoursFor,
} from "@/lib/fasting";
import { HOUR_MS, formatDayTime, formatTime, fromLocalInput, toLocalInput } from "@/lib/time";
import type { Fast, ProtocolId } from "@/lib/types";
import { protocolKeys } from "@/lib/why";
import { QuickDrinks, useFastFlows } from "../FastFlows";
import { FastRing } from "../FastRing";
import { Button, Card, Check, Field, Notice, Page } from "../kit";
import { useToast } from "../Toast";
import { WhyCards } from "../WhyCard";

export function FastScreen() {
  const fast = useActiveFast();
  return (
    <Page title="Fast">
      {fast === undefined ? null : fast ? <Running fast={fast} /> : <StartFast />}
      <p className="text-sm text-muted">{DISCLAIMER}</p>
    </Page>
  );
}

function StartFast() {
  const settings = useSettings();
  const fasts = useFasts();
  const toast = useToast();
  const now = useNow(30_000);
  const [picked, setPicked] = useState<ProtocolId | null>(null);
  const [custom, setCustom] = useState<string>("");
  const [earlier, setEarlier] = useState(false);
  const [startLocal, setStartLocal] = useState("");
  const [ack, setAck] = useState(false);
  if (!settings) return null;

  const protocol = picked ?? settings.defaultProtocol;
  const customHours = custom ? Number(custom) : settings.customHours;
  const target = targetHoursFor(protocol, customHours);
  const needsAck = requiresDoctorAck(target);
  const suggestion = fasts ? protocolSuggestion(fasts, now, settings.tz) : null;

  return (
    <>
      <Card title="Pick a protocol">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Protocol">
          {PROTOCOLS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={protocol === p.id}
              onClick={() => {
                setPicked(p.id);
                setAck(false);
              }}
              className={`flex min-h-16 flex-col items-center justify-center rounded-2xl px-1 ${protocol === p.id ? "bg-accent text-accent-ink" : "bg-surface-2"}`}
            >
              <span className="text-xl font-bold">{p.label}</span>
              {p.id === settings.defaultProtocol && <span className="text-xs">default</span>}
            </button>
          ))}
        </div>
        <p className="mt-3 text-base text-muted">
          {target} h fast · {PROTOCOLS.find((p) => p.id === protocol)?.note}
        </p>
        {protocol === "custom" && (
          <Field label="Custom hours">
            <input inputMode="decimal" value={custom} placeholder={String(settings.customHours)} onChange={(e) => setCustom(e.target.value)} />
          </Field>
        )}
        {suggestion && <p className="mt-2 text-base text-info">{suggestion}</p>}
      </Card>

      {isExtended(target) && <Notice tone="bad">{EXTENDED_WARNING}</Notice>}
      {target === 24 && <Notice tone="info">An occasional 24 h fast fits best on an M or Z day.</Notice>}

      <Card>
        <Check checked={earlier} onChange={setEarlier}>
          I started earlier (backdate)
        </Check>
        {earlier && (
          <Field label="Started at">
            <input type="datetime-local" value={startLocal || toLocalInput(now - 2 * HOUR_MS)} onChange={(e) => setStartLocal(e.target.value)} />
          </Field>
        )}
        {needsAck && (
          <Check checked={ack} onChange={setAck}>
            I&apos;ve checked with my doctor about fasts over 24 h, and I&apos;ll stop if I feel dizzy, faint or have
            palpitations.
          </Check>
        )}
        <Button
          variant="primary"
          big
          className="mt-3 w-full"
          disabled={needsAck && !ack}
          onClick={async () => {
            try {
              const startAt = earlier ? fromLocalInput(startLocal || toLocalInput(now - 2 * HOUR_MS)) : new Date().toISOString();
              await startFast({ protocol, targetHours: target, startAt, doctorAck: ack });
              if (protocol === "custom") await saveSettings({ customHours: target });
              toast(`${protocol} fast started`, "good");
            } catch (e) {
              toast((e as Error).message, "bad");
            }
          }}
        >
          Start {protocol === "custom" ? `${target} h` : protocol} fast
        </Button>
      </Card>

      <WhyCards keys={protocolKeys(protocol, target)} />
      <Link href="/fast/history" className="btn flex min-h-12 items-center justify-center rounded-2xl bg-surface text-lg">
        History, streaks &amp; averages
      </Link>
    </>
  );
}

function Running({ fast }: { fast: Fast }) {
  const now = useNow();
  const p = progress(fast, now);
  const hours = p.elapsedMs / HOUR_MS;
  const stageIdx = stageIndexAt(hours);
  const { requestEnd } = useFastFlows();
  const [editing, setEditing] = useState(false);
  const during = useIntakeBetween(fast.startAt, new Date(now + 60_000).toISOString());
  const t = totals(during ?? []);

  return (
    <>
      <Card>
        <FastRing {...p} caption={`${fast.protocol} fast`} />
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-sm text-muted">Started</dt>
            <dd className="text-lg tabular">{formatDayTime(fast.startAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Target</dt>
            <dd className="text-lg tabular">{fast.targetHours} h</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Ends</dt>
            <dd className="text-lg tabular">{formatDayTime(p.projectedEnd)}</dd>
          </div>
        </dl>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button variant="primary" big onClick={() => requestEnd(fast)}>
            End fast
          </Button>
          <Button big onClick={() => setEditing((e) => !e)}>
            Edit start
          </Button>
        </div>
        {editing && <EditStart fast={fast} onDone={() => setEditing(false)} />}
      </Card>

      {fast.targetHours > 24 && <Notice tone="bad">{EXTENDED_WARNING}</Notice>}
      {hours > 24 && (
        <Notice>Past 24 h: Train shows only M, Z or the Daily 10. No 4×4, Q5 or heavy carries.</Notice>
      )}

      <Card title="During the fast">
        <QuickDrinks />
        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Total label="Water" value={`${t.waterOz} oz`} />
          <Total label="Coffee" value={String(t.coffee)} />
          <Total label="Tea" value={String(t.tea)} />
          <Total label="Electro." value={String(t.electrolytes)} />
        </dl>
        {(t.naMg > 0 || t.kMg > 0 || t.mgMg > 0) && (
          <p className="mt-2 text-center text-base text-muted tabular">
            Na {t.naMg} mg · K {t.kMg} mg · Mg {t.mgMg} mg
          </p>
        )}
      </Card>

      <Card title="Stages" action={<span className="text-sm text-muted">{STAGE_CAVEAT}</span>}>
        <ol className="flex flex-col gap-2">
          {STAGES.filter((s) => s.fromH < Math.max(fast.targetHours, 24)).map((s, i) => (
            <li
              key={s.label}
              className={`flex items-center justify-between rounded-xl px-3 py-2 ${i === stageIdx ? "bg-accent/15 text-accent" : i < stageIdx ? "text-muted" : ""}`}
            >
              <span>
                {s.label}
                {s.extended && <span className="text-sm text-muted"> (extended, doctor note)</span>}
              </span>
              <span className="text-base tabular">
                {s.fromH}–{s.toH} h
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <WhyCards keys={[...protocolKeys(fast.protocol, fast.targetHours), "fasting:during", "training:during-fast"]} />
      <Link href="/fast/history" className="btn flex min-h-12 items-center justify-center rounded-2xl bg-surface text-lg">
        History, streaks &amp; averages
      </Link>
    </>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg tabular">{value}</dd>
    </div>
  );
}

function EditStart({ fast, onDone }: { fast: Fast; onDone: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(toLocalInput(fast.startAt));
  return (
    <div className="mt-3 flex flex-col gap-3">
      <Field label="Started at">
        <input type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} />
      </Field>
      <Button
        variant="primary"
        onClick={async () => {
          try {
            await editFast(fast.id, { startAt: fromLocalInput(v) });
            toast(`Start moved to ${formatTime(fromLocalInput(v))}`, "good");
            onDone();
          } catch (e) {
            toast((e as Error).message, "bad");
          }
        }}
      >
        Save start time
      </Button>
    </div>
  );
}
