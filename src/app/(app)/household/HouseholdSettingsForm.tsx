"use client";

import { useState, useTransition } from "react";
import { newCode, saveSettings, setPantryItem } from "@/actions/household";
import { Icon } from "@/components/icons";
import { Button, Card, Chip, ErrorText, Field, inputClass, Stepper } from "@/components/ui";
import type { HouseholdSettings } from "@/db/schema";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];

export function HouseholdSettingsForm(props: {
  name: string;
  settings: HouseholdSettings;
  inviteCode: string;
  inviteLink: string;
  members: { id: string; name: string; email: string }[];
  me: string;
  pantry: { key: string; name: string; onHand: boolean }[];
  basics: { key: string; name: string }[];
  aiEnabled: boolean;
}) {
  const [name, setName] = useState(props.name);
  const [s, setS] = useState(props.settings);
  const [code, setCode] = useState(props.inviteCode);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const [pantry, setPantry] = useState(props.pantry);
  const set = <K extends keyof HouseholdSettings>(k: K, v: HouseholdSettings[K]) => {
    setSaved(false);
    setS((x) => ({ ...x, [k]: v }));
  };
  const excluded = new Set(pantry.filter((p) => !p.onHand).map((p) => p.key));
  const extras = pantry.filter((p) => p.onHand);
  const link = props.inviteLink.replace(props.inviteCode, code);

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-display text-lg font-semibold">Members</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {props.members.map((m) => (
            <li key={m.id} className="flex justify-between">
              <span className="font-medium">
                {m.name}
                {m.id === props.me ? " (you)" : ""}
              </span>
              <span className="text-muted">{m.email}</span>
            </li>
          ))}
        </ul>
        <div className="rounded-2xl bg-surface-2 p-3 text-sm">
          <p className="font-medium">Invite someone</p>
          <p className="text-muted">They sign up with this code and see the same recipes, plan and list.</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-widest">{code}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={async () => {
                const text = `Join our meal planner: ${link}`;
                try {
                  if (navigator.share) await navigator.share({ title: "Meal planner invite", text, url: link });
                  else await navigator.clipboard.writeText(text);
                } catch {
                  /* cancelled */
                }
              }}
            >
              <Icon name="copy" className="size-4" /> Share invite link
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                start(async () => {
                  const res = await newCode();
                  if (res.ok) setCode(res.value);
                })
              }
            >
              New code
            </Button>
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="font-display text-lg font-semibold">Planning</h2>
        <Field label="Household name">
          <input value={name} onChange={(e) => (setSaved(false), setName(e.target.value))} className={inputClass} />
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">People eating</span>
          <Stepper label="people" value={s.people} min={1} max={20} onChange={(v) => set("people", v)} />
        </div>
        <div>
          <p className="text-sm font-medium">Usual meals per week</p>
          <p className="text-xs text-muted">The starting numbers when you plan a new week.</p>
          {(
            [
              ["breakfasts", "Breakfasts"],
              ["lunches", "Lunches"],
              ["dinners", "Dinners"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="mt-2 flex items-center justify-between">
              <span className="text-sm">{label}</span>
              <Stepper label={label.toLowerCase()} value={s[k]} onChange={(v) => set(k, v)} />
            </div>
          ))}
        </div>
        <div>
          <p className="text-sm font-medium">Usual store</p>
          <div className="mt-1.5 flex gap-2">
            <Chip selected={s.store === "walmart"} onClick={() => set("store", "walmart")}>
              Walmart
            </Chip>
            <Chip selected={s.store === "sams"} onClick={() => set("store", "sams")}>
              Sam&apos;s Club
            </Chip>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weeks start on">
            <select value={s.weekStartsOn} onChange={(e) => set("weekStartsOn", Number(e.target.value))} className={inputClass}>
              {DAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time zone">
            <select value={s.timeZone} onChange={(e) => set("timeZone", e.target.value)} className={inputClass}>
              {[...new Set([s.timeZone, ...ZONES])].map((z) => (
                <option key={z} value={z}>
                  {z.replace("America/", "").replace("Pacific/", "").replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <Button
          variant="primary"
          busy={pending}
          onClick={() =>
            start(async () => {
              setError(undefined);
              const res = await saveSettings({ name, ...s });
              if (res.ok) setSaved(true);
              else setError(res.error);
            })
          }
        >
          {saved ? (
            <>
              <Icon name="check" /> Saved
            </>
          ) : (
            "Save"
          )}
        </Button>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-display text-lg font-semibold">Always on hand</h2>
        <p className="text-sm text-muted">These start as “have it” on every list. Tap one you don&apos;t keep stocked.</p>
        <div className="flex flex-wrap gap-2">
          {props.basics.map((b) => (
            <Chip
              key={b.key}
              selected={!excluded.has(b.key)}
              onClick={() => {
                const onHand = excluded.has(b.key);
                setPantry((p) => (onHand ? p.filter((x) => x.key !== b.key) : [...p.filter((x) => x.key !== b.key), { key: b.key, name: b.name, onHand: false }]));
                start(() => setPantryItem(b.key, b.name, onHand ? null : false).then(() => undefined));
              }}
            >
              {b.name}
            </Chip>
          ))}
          {extras.map((p) => (
            <Chip
              key={p.key}
              selected
              onClick={() => {
                setPantry((x) => x.filter((y) => y.key !== p.key));
                start(() => setPantryItem(p.key, p.name, null).then(() => undefined));
              }}
            >
              {p.name}
            </Chip>
          ))}
        </div>
        <p className="text-xs text-muted">Add more from the grocery list: open an item and tap “We always have this”.</p>
      </Card>

      <Card className="p-4 text-sm">
        <h2 className="font-display text-lg font-semibold">Photo import</h2>
        <p className="mt-1 text-muted">
          {props.aiEnabled
            ? "On. Recipe cards, cookbook pages and image-only pins can be read from photos."
            : "Off. Add an ANTHROPIC_API_KEY to the app's environment to read recipes from photos and image-only pins."}
        </p>
      </Card>

    </div>
  );
}
