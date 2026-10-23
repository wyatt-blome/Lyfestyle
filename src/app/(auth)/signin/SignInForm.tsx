"use client";

import { useActionState } from "react";
import { signIn, type FormState } from "@/actions/auth";
import { Button, ErrorText, Field, inputClass } from "@/components/ui";

export function SignInForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Password">
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <Button variant="primary" size="lg" busy={pending} type="submit">
        Sign in
      </Button>
    </form>
  );
}
