// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { REPLY_MAX, initialReplyState, type ReplyState } from "@/lib/complaints/reply";
import { initialActionState, STAFF_STATUS_ACTIONS, type ActionState } from "@/lib/staff/actions";
import type { ComplaintStatus } from "@/lib/complaints/student-view";

type Act = (prev: ActionState, fd: FormData) => Promise<ActionState>;
const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
const btn = "rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60";
const btn2 = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60";

function Feedback({ state, name }: { state: ActionState; name?: string }) {
  const err = name ? state.fieldErrors?.[name] : undefined;
  return (
    <>
      {err ? <p role="alert" className="text-sm text-red-700">{err}</p> : null}
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p> : null}
    </>
  );
}

export function StaffReplyForm({ complaintId, action }: { complaintId: string; action: (prev: ReplyState, fd: FormData) => Promise<ReplyState> }) {
  const [state, run, pending] = useActionState(action, initialReplyState);
  const error = state.fieldErrors?.body;
  return (
    <form action={run} key={state.ok ? "sent" : "draft"} className="space-y-2" encType="multipart/form-data">
      <input type="hidden" name="complaintId" value={complaintId} />
      <label htmlFor="reply-body" className="block text-sm font-medium">Reply to the student</label>
      <textarea id="reply-body" name="body" required rows={4} maxLength={REPLY_MAX + 500} defaultValue={state.ok ? "" : (state.body ?? "")} aria-invalid={error ? true : undefined} className={input} />
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p> : null}
      <button type="submit" disabled={pending} className={btn}>{pending ? "Sending..." : "Send reply"}</button>
    </form>
  );
}

export function StatusForm({ complaintId, options, action }: { complaintId: string; options: readonly ComplaintStatus[]; action: Act }) {
  const [state, run, pending] = useActionState(action, initialActionState);
  if (options.length === 0) return <p className="text-sm text-slate-600">No status changes are available.</p>;
  return (
    <form action={run} className="space-y-2">
      <input type="hidden" name="complaintId" value={complaintId} />
      <label htmlFor="newStatus" className="block text-sm font-medium">Change status</label>
      <select id="newStatus" name="newStatus" required defaultValue="" className={input}>
        <option value="" disabled>Choose...</option>
        {options.map((s) => <option key={s} value={s}>{STAFF_STATUS_ACTIONS[s] ?? s}</option>)}
      </select>
      <label htmlFor="status-reason" className="block text-sm font-medium">Note for the history (optional)</label>
      <textarea id="status-reason" name="reason" rows={2} maxLength={1000} className={input} />
      <Feedback state={state} name="newStatus" />
      <button type="submit" disabled={pending} className={btn2}>{pending ? "Saving..." : "Update status"}</button>
    </form>
  );
}

export function EscalateForm({ complaintId, action }: { complaintId: string; action: Act }) {
  const [state, run, pending] = useActionState(action, initialActionState);
  return (
    <details className="rounded-md border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-medium">Escalate to a main lecturer</summary>
      <form action={run} className="mt-3 space-y-2">
        <input type="hidden" name="complaintId" value={complaintId} />
        <label htmlFor="esc-reason" className="block text-sm font-medium">Why is this being escalated?</label>
        <textarea id="esc-reason" name="reason" required rows={3} maxLength={1000} className={input} />
        <Feedback state={state} name="reason" />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="restrict" /> <span>Also restrict access: only main lecturers with institution-wide access will be able to see it. This cannot be undone.</span></label>
        <button type="submit" disabled={pending} className={btn2}>{pending ? "Escalating..." : "Escalate"}</button>
      </form>
    </details>
  );
}

export function AssignForm({ complaintId, lecturers, action }: { complaintId: string; lecturers: readonly { id: string; label: string }[]; action: Act }) {
  const [state, run, pending] = useActionState(action, initialActionState);
  return (
    <form action={run} className="space-y-2">
      <input type="hidden" name="complaintId" value={complaintId} />
      <label htmlFor={`lecturer-${complaintId}`} className="block text-sm font-medium">Assign to lecturer</label>
      <select id={`lecturer-${complaintId}`} name="lecturerId" required defaultValue="" className={input}>
        <option value="" disabled>Choose a lecturer...</option>
        {lecturers.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
      <Feedback state={state} name="lecturerId" />
      <button type="submit" disabled={pending} className={btn}>{pending ? "Assigning..." : "Assign"}</button>
    </form>
  );
}

export function RevokeButton({ complaintId, profileId, name, action }: { complaintId: string; profileId: string; name: string; action: Act }) {
  const [state, run, pending] = useActionState(action, initialActionState);
  return (
    <form action={run} className="inline-flex items-center gap-2">
      <input type="hidden" name="complaintId" value={complaintId} />
      <input type="hidden" name="profileId" value={profileId} />
      <button type="submit" disabled={pending} aria-label={`Remove access for ${name}`} className="text-sm text-red-700 underline disabled:opacity-60">{pending ? "Removing..." : "Remove access"}</button>
      <Feedback state={state} />
    </form>
  );
}
