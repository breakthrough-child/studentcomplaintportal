// UNVERIFIED: depends on react and next, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { Notice } from "@/components/auth-card";
import { FormField, SubmitButton } from "@/components/form-field";
import { initialFormState } from "@/lib/validation/form";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <input type="hidden" name="next" value={next} />
      <FormField id="email" name="email" label="Email address" type="email" autoComplete="username" error={state.fieldErrors?.email} maxLength={320} />
      <FormField id="password" name="password" label="Password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} maxLength={128} />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
