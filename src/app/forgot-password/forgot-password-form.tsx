// UNVERIFIED: depends on react and next, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { Notice } from "@/components/auth-card";
import { FormField, SubmitButton } from "@/components/form-field";
import { initialFormState } from "@/lib/validation/form";
import { forgotPasswordAction } from "./actions";

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice> : null}
      <FormField id="email" name="email" label="Email address" type="email" autoComplete="email" error={state.fieldErrors?.email} maxLength={320} />
      <SubmitButton pending={pending}>Send reset link</SubmitButton>
    </form>
  );
}
