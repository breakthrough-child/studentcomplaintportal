// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { initialAdminState, type AdminState } from "@/lib/admin/schemas";

type Props = {
  action: (prev: AdminState, formData: FormData) => Promise<AdminState>;
  submit: string;
  children: React.ReactNode;
  className?: string;
  tone?: "primary" | "danger" | "plain";
  confirmText?: string;
};

const TONES = {
  primary: "bg-brand-700 text-white hover:bg-brand-800",
  danger: "bg-red-700 text-white hover:bg-red-800",
  plain: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
} as const;

/** A form bound to an admin Server Action. Shows pending, success and per-field errors. */
export function AdminForm({ action, submit, children, className, tone = "primary", confirmText }: Props) {
  const [state, run, pending] = useActionState(action, initialAdminState);
  const errors = Object.values(state.fieldErrors ?? {});
  return (
    <form action={run} className={className ?? "space-y-3"} onSubmit={(e) => { if (confirmText && !window.confirm(confirmText)) e.preventDefault(); }}>
      {children}
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p> : null}
      {errors.length > 0 ? <ul role="alert" className="list-disc pl-5 text-sm text-red-700">{errors.map((m) => <li key={m}>{m}</li>)}</ul> : null}
      <button type="submit" disabled={pending} className={`rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-60 ${TONES[tone]}`}>{pending ? "Working..." : submit}</button>
    </form>
  );
}
