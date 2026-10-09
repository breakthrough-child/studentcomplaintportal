// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { claimAction, type ClaimState } from "../actions";

export function ClaimForm() {
  const [state, action, pending] = useActionState<ClaimState, FormData>(claimAction, { ok: false });
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="registrationNumber" className="block text-sm font-medium">Registration number</label>
      <input id="registrationNumber" name="registrationNumber" required maxLength={40} autoComplete="off" aria-describedby={state.fieldError ? "reg-error" : undefined} className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm" />
      {state.fieldError ? <p id="reg-error" role="alert" className="text-sm text-red-700">{state.fieldError}</p> : null}
      {state.message ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-green-800" : "text-sm text-red-700"}>{state.message}</p> : null}
      <button type="submit" disabled={pending} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{pending ? "Linking..." : "Link my record"}</button>
    </form>
  );
}
