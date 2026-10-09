// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { replyAction } from "../actions";
import { REPLY_MAX, initialReplyState } from "@/lib/complaints/reply";

export function ReplyForm({ complaintId }: { complaintId: string }) {
  const [state, action, pending] = useActionState(replyAction, initialReplyState);
  const error = state.fieldErrors?.body;
  return (
    // key: remount (clearing the box) after a successful send; on failure the text is echoed back.
    <form action={action} key={state.ok ? "sent" : "draft"} className="space-y-2">
      <input type="hidden" name="complaintId" value={complaintId} />
      <label htmlFor="body" className="block text-sm font-medium">Your reply</label>
      <textarea id="body" name="body" required rows={4} maxLength={REPLY_MAX + 500} defaultValue={state.ok ? "" : (state.body ?? "")} aria-describedby={error ? "body-error" : undefined} aria-invalid={error ? true : undefined} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      {error ? <p id="body-error" role="alert" className="text-sm text-red-700">{error}</p> : null}
      {state.message ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-green-800" : "text-sm text-red-700"}>{state.message}</p> : null}
      <button type="submit" disabled={pending} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">{pending ? "Sending..." : "Send reply"}</button>
    </form>
  );
}
