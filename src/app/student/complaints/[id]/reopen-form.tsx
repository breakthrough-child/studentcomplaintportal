// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/staff/actions";
import { reopenAction } from "../actions";

export function ReopenForm({ complaintId }: { complaintId: string }) {
  const [state, run, pending] = useActionState(reopenAction, initialActionState);
  const err = state.fieldErrors?.reason;
  return (
    <form action={run} className="space-y-2 rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <input type="hidden" name="complaintId" value={complaintId} />
      <h2 className="font-medium">Not resolved?</h2>
      <label htmlFor="reopen-reason" className="block text-sm">Tell us why this complaint should be reopened.</label>
      <textarea id="reopen-reason" name="reason" required rows={3} maxLength={2000} aria-invalid={err ? true : undefined} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      {err ? <p role="alert" className="text-sm text-red-700">{err}</p> : null}
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p> : null}
      <button type="submit" disabled={pending} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">{pending ? "Reopening..." : "Reopen complaint"}</button>
    </form>
  );
}
