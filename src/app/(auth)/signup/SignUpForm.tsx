"use client";

import { useActionState, useState } from "react";
import { signUp, type FormState } from "@/actions/auth";
import { Button, cx, ErrorText, Field, inputClass } from "@/components/ui";

export function SignUpForm({ initialCode }: { initialCode: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});
  const [mode, setMode] = useState<"create" | "join">(initialCode ? "join" : "create");
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface p-1" role="radiogroup" aria-label="Household">
        {(["create", "join"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cx("h-10 rounded-full text-sm font-medium", mode === m ? "bg-brand text-brand-ink" : "text-muted")}
          >
            {m === "create" ? "Start a household" : "Join my household"}
          </button>
        ))}
      </div>
      <input type="hidden" name="mode" value={mode} />
      <Field label="Your name">
        <input name="name" autoComplete="given-name" required className={inputClass} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className={inputClass} />
      </Field>
      {mode === "create" ? (
        <Field label="Household name" hint="Optional, e.g. “The Blomes”.">
          <input name="householdName" className={inputClass} />
        </Field>
      ) : (
        <Field label="Invite code" hint="Find it in Household on a family member's phone.">
          <input name="inviteCode" defaultValue={initialCode} required placeholder="ABCD-2345" autoCapitalize="characters" className={cx(inputClass, "uppercase tracking-widest")} />
        </Field>
      )}
      <ErrorText>{state.error}</ErrorText>
      <Button variant="primary" size="lg" busy={pending} type="submit">
        {mode === "create" ? "Create account" : "Join household"}
      </Button>
    </form>
  );
}
