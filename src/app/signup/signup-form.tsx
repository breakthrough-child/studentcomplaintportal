// UNVERIFIED: depends on react and next, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { Notice } from "@/components/auth-card";
import { FormField, SubmitButton } from "@/components/form-field";
import { initialFormState } from "@/lib/validation/form";
import { signupAction } from "./actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialFormState);
  if (state.ok) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <FormField id="email" name="email" label="School email address" type="email" autoComplete="email" error={state.fieldErrors?.email} maxLength={320} />
      <FormField id="registrationNumber" name="registrationNumber" label="Registration number" type="text" autoComplete="off" error={state.fieldErrors?.registrationNumber} maxLength={40} />
      <SubmitButton pending={pending}>Create my account</SubmitButton>
    </form>
  );
}
