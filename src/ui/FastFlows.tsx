"use client";
// Flows shared by Home, Fast and Log: quick-logging drinks, the full add-entry sheet, the
// "End fast at <time>?" prompt when something breaks a fast, and the end-of-fast check-in.
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { checkInFast, endFast } from "@/client/fasts";
import { logIntake, QUICK_DRINKS, wouldBreakFast } from "@/client/intake";
import { formatTime, fromLocalInput, toLocalInput } from "@/lib/time";
import type { Fast, IntakeKind, IntakeTemplate } from "@/lib/types";
import { Button, Check, Field, Scale, Sheet } from "./kit";
import { useToast } from "./Toast";
import { WhyCards } from "./WhyCard";

interface FlowApi {
  logTemplate: (t: IntakeTemplate, at?: string) => Promise<void>;
  openAddEntry: (preset?: Partial<IntakeTemplate>) => void;
  openElectrolytes: () => void;
  requestEnd: (fast: Fast, at?: string) => void;
  openCheckIn: (fastId: string) => void;
}

const Ctx = createContext<FlowApi | null>(null);

export function useFastFlows(): FlowApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("FastFlowsProvider missing");
  return v;
}

export function FastFlowsProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [breakPrompt, setBreakPrompt] = useState<{ fast: Fast; at: string; viaFood: boolean } | null>(null);
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [addPreset, setAddPreset] = useState<Partial<IntakeTemplate> | null>(null);
  const [electrolytes, setElectrolytes] = useState(false);

  const logTemplate = useCallback(
    async (t: IntakeTemplate, at?: string) => {
      const when = at ?? new Date().toISOString();
      const { breaks } = await logIntake(t, when);
      toast(`Logged ${t.name} at ${formatTime(when)}`, "good");
      if (breaks) setBreakPrompt({ fast: breaks, at: when, viaFood: true });
    },
    [toast],
  );

  const api: FlowApi = {
    logTemplate,
    openAddEntry: (preset) => setAddPreset(preset ?? {}),
    openElectrolytes: () => setElectrolytes(true),
    requestEnd: (fast, at) => setBreakPrompt({ fast, at: at ?? new Date().toISOString(), viaFood: false }),
    openCheckIn: setCheckInId,
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      <BreakFastSheet
        prompt={breakPrompt}
        onClose={() => setBreakPrompt(null)}
        onEnded={(id) => {
          setBreakPrompt(null);
          setCheckInId(id);
        }}
      />
      <CheckInSheet fastId={checkInId} onClose={() => setCheckInId(null)} />
      <AddEntrySheet
        preset={addPreset}
        onClose={() => setAddPreset(null)}
        onSave={async (t, at) => {
          setAddPreset(null);
          await logTemplate(t, at);
        }}
      />
      <ElectrolyteSheet
        open={electrolytes}
        onClose={() => setElectrolytes(false)}
        onSave={async (t) => {
          setElectrolytes(false);
          await logTemplate(t);
        }}
      />
    </Ctx.Provider>
  );
}

function BreakFastSheet({
  prompt,
  onClose,
  onEnded,
}: {
  prompt: { fast: Fast; at: string; viaFood: boolean } | null;
  onClose: () => void;
  onEnded: (fastId: string) => void;
}) {
  const toast = useToast();
  const [atLocal, setAtLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const at = prompt ? (atLocal ? fromLocalInput(atLocal) : prompt.at) : "";
  return (
    <Sheet
      open={!!prompt}
      onClose={() => {
        setAtLocal("");
        onClose();
      }}
      title={prompt ? `End fast at ${formatTime(at)}?` : ""}
    >
      {prompt && (
        <div className="flex flex-col gap-4">
          <p className="text-muted">
            {prompt.viaFood
              ? "That entry has calories, so it breaks your fast."
              : `Your ${prompt.fast.protocol} fast will be saved with this end time.`}
          </p>
          <Field label="End time">
            <input
              type="datetime-local"
              value={atLocal || toLocalInput(prompt.at)}
              onChange={(e) => setAtLocal(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="primary"
              big
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await endFast(prompt.fast.id, at);
                  setAtLocal("");
                  onEnded(prompt.fast.id);
                } catch (e) {
                  toast((e as Error).message, "bad");
                } finally {
                  setBusy(false);
                }
              }}
            >
              End fast
            </Button>
            <Button
              big
              onClick={() => {
                setAtLocal("");
                onClose();
              }}
            >
              Keep fasting
            </Button>
          </div>
          <WhyCards ids={["why-protein"]} />
        </div>
      )}
    </Sheet>
  );
}

function CheckInSheet({ fastId, onClose }: { fastId: string | null; onClose: () => void }) {
  const [v, setV] = useState<{ energy?: number; hunger?: number; mood?: number; sleep?: number; notes?: string }>({});
  const close = () => {
    setV({});
    onClose();
  };
  return (
    <Sheet open={!!fastId} onClose={close} title="How did that fast feel?">
      <div className="flex flex-col gap-4">
        <Scale label="Energy" value={v.energy} onChange={(n) => setV({ ...v, energy: n })} />
        <Scale label="Hunger" value={v.hunger} onChange={(n) => setV({ ...v, hunger: n })} low="Not hungry" high="Starving" />
        <Scale label="Mood" value={v.mood} onChange={(n) => setV({ ...v, mood: n })} />
        <Scale label="Sleep last night" value={v.sleep} onChange={(n) => setV({ ...v, sleep: n })} low="Poor" high="Great" />
        <Field label="Notes">
          <textarea rows={2} value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="primary"
            big
            onClick={async () => {
              if (fastId) await checkInFast(fastId, v);
              close();
            }}
          >
            Save
          </Button>
          <Button big onClick={close}>
            Skip
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

const KINDS: IntakeKind[] = ["meal", "snack", "drink", "supplement"];

function AddEntrySheet({
  preset,
  onClose,
  onSave,
}: {
  preset: Partial<IntakeTemplate> | null;
  onClose: () => void;
  onSave: (t: IntakeTemplate, at: string) => Promise<void>;
}) {
  return (
    <Sheet open={!!preset} onClose={onClose} title="Add food or drink">
      {preset && <AddEntryForm key={JSON.stringify(preset)} preset={preset} onSave={onSave} />}
    </Sheet>
  );
}

function AddEntryForm({
  preset,
  onSave,
}: {
  preset: Partial<IntakeTemplate>;
  onSave: (t: IntakeTemplate, at: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<IntakeKind>(preset.kind ?? "meal");
  const [name, setName] = useState(preset.name ?? "");
  const [at, setAt] = useState(() => toLocalInput(Date.now()));
  const [qty, setQty] = useState(preset.qty?.toString() ?? "");
  const [unit, setUnit] = useState(preset.unit ?? "");
  const [protein, setProtein] = useState(preset.proteinG?.toString() ?? "");
  const [kcal, setKcal] = useState(preset.kcal?.toString() ?? "");
  const [caffeine, setCaffeine] = useState(!!preset.caffeine);
  const [breaksTouched, setBreaksTouched] = useState(false);
  const [breaks, setBreaks] = useState(preset.breaksFast ?? true);
  const [tags, setTags] = useState((preset.tags ?? []).join(", "));
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const autoBreaks = kind === "meal" || kind === "snack" || (num(kcal) ?? 0) > 0;
  const breaksFast = breaksTouched ? breaks : autoBreaks;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        const t: IntakeTemplate = {
          kind,
          name: name.trim(),
          source: preset.source,
          barcode: preset.barcode,
          qty: num(qty),
          unit: unit.trim() || undefined,
          proteinG: num(protein),
          kcal: num(kcal),
          caffeine: caffeine || undefined,
          breaksFast,
          tags: tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        };
        await onSave({ ...t, breaksFast: wouldBreakFast(t) }, fromLocalInput(at));
      }}
    >
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Kind">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`min-h-12 rounded-xl text-base capitalize ${kind === k ? "bg-accent text-accent-ink font-semibold" : "bg-surface-2"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <Field label="What">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Breakfast, eggs, protein shake…" autoFocus />
      </Field>
      <Field label="When">
        <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Unit">
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="g, oz, cup" />
        </Field>
        <Field label="Protein g">
          <input inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </Field>
        <Field label="kcal (optional)">
          <input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </Field>
      </div>
      <Field label="Tags" hint="Comma separated">
        <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </Field>
      <Check checked={caffeine} onChange={setCaffeine}>
        Has caffeine
      </Check>
      <Check
        checked={breaksFast}
        onChange={(v) => {
          setBreaksTouched(true);
          setBreaks(v);
        }}
      >
        Breaks a fast (anything with calories does)
      </Check>
      <Button type="submit" variant="primary" big disabled={!name.trim()}>
        Save
      </Button>
    </form>
  );
}

function ElectrolyteSheet({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (t: IntakeTemplate) => Promise<void>;
}) {
  const [na, setNa] = useState("");
  const [k, setK] = useState("");
  const [mg, setMg] = useState("");
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const base = QUICK_DRINKS.find((d) => d.label === "Electrolytes")!.template;
  return (
    <Sheet open={open} onClose={onClose} title="Electrolytes">
      <div className="flex flex-col gap-3">
        <p className="text-muted">Amounts are optional.</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sodium mg">
            <input inputMode="numeric" value={na} onChange={(e) => setNa(e.target.value)} />
          </Field>
          <Field label="Potassium mg">
            <input inputMode="numeric" value={k} onChange={(e) => setK(e.target.value)} />
          </Field>
          <Field label="Magnesium mg">
            <input inputMode="numeric" value={mg} onChange={(e) => setMg(e.target.value)} />
          </Field>
        </div>
        <Button
          variant="primary"
          big
          onClick={async () => {
            const el = { naMg: num(na), kMg: num(k), mgMg: num(mg) };
            const any = el.naMg || el.kMg || el.mgMg;
            await onSave({ ...base, electrolytes: any ? el : undefined });
            setNa("");
            setK("");
            setMg("");
          }}
        >
          Log electrolytes
        </Button>
      </div>
    </Sheet>
  );
}

/** The row of fast-safe quick-add buttons. */
export function QuickDrinks() {
  const { logTemplate, openElectrolytes, openAddEntry } = useFastFlows();
  return (
    <div className="grid grid-cols-2 gap-3">
      {QUICK_DRINKS.map((d) => (
        <Button
          key={d.label}
          onClick={() => (d.label === "Electrolytes" ? openElectrolytes() : logTemplate(d.template))}
        >
          + {d.label}
        </Button>
      ))}
      <Button className="col-span-2" variant="ghost" onClick={() => openAddEntry({ kind: "meal" })}>
        + Food or other drink
      </Button>
    </div>
  );
}
