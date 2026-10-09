// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/staff/actions";
import { settingsAction } from "./actions";

export function SettingsForm({ title, acceptsComplaints }: { title: string; acceptsComplaints: boolean }) {
  const [state, run, pending] = useActionState(settingsAction, initialActionState);
  return (
    <form action={run} className="space-y-3">
      <div>
        <label htmlFor="title" className="block text-sm font-medium">Title shown to students</label>
        <input id="title" name="title" defaultValue={title} maxLength={100} placeholder="e.g. Dr, Prof" className="mt-1 w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm" />
        {state.fieldErrors?.title ? <p role="alert" className="text-sm text-red-700">{state.fieldErrors.title}</p> : null}
      </div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="acceptsComplaints" defaultChecked={acceptsComplaints} /> <span>Students can choose me as the recipient of a new complaint. Complaints already addressed to me are not affected.</span></label>
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p> : null}
      <button type="submit" disabled={pending} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{pending ? "Saving..." : "Save settings"}</button>
    </form>
  );
}
