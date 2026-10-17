"use client";
import { useEffect, useState } from "react";
import { requestPersistence } from "@/client/backup";
import { saveSettings, useSettings } from "@/client/settings";
import { DISCLAIMER } from "@/lib/fasting";
import { Button, Check, Field, Sheet } from "./kit";

/** First-run sheet: the disclaimer, age (for HR zones) and a storage-persistence request. */
export function Onboarding() {
  const settings = useSettings();
  const [age, setAge] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    void requestPersistence();
  }, []);

  if (!settings || settings.onboarded) return null;
  return (
    <Sheet open onClose={() => {}} title="Welcome to Fast & Move">
      <div className="flex flex-col gap-4">
        <p>
          Fasting is the centerpiece: a 16:8 default, a fixed training rotation, and a demo for every move. Everything
          stays on this phone.
        </p>
        <p className="rounded-2xl border border-warn/40 bg-warn/10 p-3 text-warn">{DISCLAIMER}</p>
        <Field label="Your age" hint="Used for heart-rate zones (HRmax = 211 − 0.64 × age).">
          <input inputMode="numeric" value={age} placeholder={String(settings.age)} onChange={(e) => setAge(e.target.value)} />
        </Field>
        <Check checked={ok} onChange={setOk}>
          I understand this is not medical advice.
        </Check>
        <Button
          variant="primary"
          big
          disabled={!ok}
          onClick={() => {
            const n = Number(age);
            void saveSettings({ onboarded: true, age: n > 10 && n < 110 ? n : settings.age });
          }}
        >
          Start
        </Button>
      </div>
    </Sheet>
  );
}
