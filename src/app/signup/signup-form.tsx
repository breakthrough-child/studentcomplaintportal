"use client";

import { useActionState, useState } from "react";
import { Notice } from "@/components/auth-card";
import { FormField, SubmitButton } from "@/components/form-field";
import type { RegistrationOptions } from "@/lib/auth/registration";
import { PASSWORD_MIN_LENGTH, type RegistrationKind } from "@/lib/validation/auth";
import { registerAction, type RegistrationState } from "./actions";

const COPY: Record<RegistrationKind, { email: string; identifier: string; identifierHint: string }> = {
  student: {
    email: "School email address",
    identifier: "Registration / matriculation number (optional)",
    identifierHint: "You can leave this blank for now.",
  },
  lecturer: {
    email: "Institutional email address",
    identifier: "Staff ID (optional)",
    identifierHint: "If you have one.",
  },
};

const SELECT =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-gold-500/40 aria-[invalid=true]:border-red-500 sm:text-sm";

function Select({ id, label, options, defaultValue, error, hint }: {
  id: string; label: string; options: RegistrationOptions["levels"]; defaultValue?: string; error?: string; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">{label}</label>
      <select id={id} name={id} required defaultValue={defaultValue ?? ""} aria-invalid={error ? true : undefined}
        aria-describedby={[error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined} className={SELECT}>
        <option value="" disabled>Choose…</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      {hint ? <p id={`${id}-hint`} className="text-xs text-slate-500">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

export function SignupForm({ initialKind, options }: { initialKind: RegistrationKind; options: RegistrationOptions }) {
  const [state, formAction, pending] = useActionState<RegistrationState, FormData>(registerAction, { ok: false });
  const [kind, setKind] = useState<RegistrationKind>(
    state.values?.kind === "lecturer" || state.values?.kind === "student" ? state.values.kind : initialKind,
  );
  if (state.ok) return <Notice tone="success">{state.message}</Notice>;
  const v = state.values;
  const e = state.fieldErrors;
  const copy = COPY[kind];

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <fieldset>
        <legend className="block text-sm font-medium text-slate-800">I am registering as</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["student", "lecturer"] as const).map((k) => (
            <label key={k} className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${kind === k ? "border-brand-700 bg-brand-50 text-brand-800" : "border-slate-300 bg-white text-slate-700"}`}>
              {/* Uncontrolled (defaultChecked): React resets the form after each submit, and a controlled
                  radio would then submit "student" while the page still shows the lecturer form. */}
              <input type="radio" name="kind" value={k} defaultChecked={kind === k} onChange={() => setKind(k)} className="sr-only" />
              {k === "student" ? "Student" : "Lecturer"}
            </label>
          ))}
        </div>
        {e?.kind ? <p className="mt-1 text-sm text-red-700">{e.kind}</p> : null}
      </fieldset>
      <FormField id="fullName" name="fullName" label="Full name" autoComplete="name" maxLength={200} defaultValue={v?.fullName} error={e?.fullName} />
      <FormField id="email" name="email" label={copy.email} type="email" autoComplete="email" maxLength={320} defaultValue={v?.email} error={e?.email}
        hint="You will sign in with this address." />
      {kind === "student" ? (
        <Select id="levelId" label="Level" options={options.levels} defaultValue={v?.levelId} error={e?.levelId} />
      ) : null}
      <Select id="departmentId" label={kind === "student" ? "Department" : "Home department"} options={options.departments}
        defaultValue={v?.departmentId} error={e?.departmentId} hint="An administrator checks this when approving your account." />
      <FormField id="personalEmail" name="personalEmail" label="Personal email address (optional)" type="email" required={false} maxLength={320}
        defaultValue={v?.personalEmail} error={e?.personalEmail} hint="Only you and administrators can see it." />
      <FormField id="identifier" name="identifier" label={copy.identifier} required={false} autoComplete="off" maxLength={40}
        defaultValue={v?.identifier} error={e?.identifier} hint={copy.identifierHint} />
      <FormField id="password" name="password" label="Password" type="password" autoComplete="new-password" maxLength={128} error={e?.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`} />
      <FormField id="confirmPassword" name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" maxLength={128} error={e?.confirmPassword} />
      <p className="text-xs text-slate-600">
        New accounts must be approved by a university administrator before you can submit or handle complaints.
        {kind === "lecturer" ? " Lecturer accounts are created with ordinary lecturer access only." : null}
      </p>
      <SubmitButton pending={pending}>Create my account</SubmitButton>
    </form>
  );
}
