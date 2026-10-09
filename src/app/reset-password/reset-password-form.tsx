// UNVERIFIED: depends on react and next, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { Notice } from "@/components/auth-card";
import { FormField, SubmitButton } from "@/components/form-field";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { initialFormState } from "@/lib/validation/form";
import { resetPasswordAction } from "./actions";

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <FormField
        id="password"
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A few unrelated words make a strong, memorable password.`}
        error={state.fieldErrors?.password}
        maxLength={PASSWORD_MAX_LENGTH}
      />
      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Repeat new password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirmPassword}
        maxLength={PASSWORD_MAX_LENGTH}
      />
      <SubmitButton pending={pending}>Save password</SubmitButton>
    </form>
  );
}
