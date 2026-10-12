// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
"use server";

import { revalidatePath } from "next/cache";
import type { ReplyState } from "@/lib/complaints/reply";
import { complaintIdSchema } from "@/lib/complaints/student-view";
import type { ActionState } from "@/lib/staff/actions";
import { assignComplaint, changeStatus, escalate, revokeAccess, staffReply } from "@/lib/staff/data";
import { deliverNotificationsSoon } from "@/lib/notifications/send";

// Each action re-checks the role inside lib/staff/data.ts (requireStaff / requireMainLecturer);
// the database functions then re-check complaint access. Nothing here trusts the page.
function refresh(formData: FormData) {
  const id = complaintIdSchema.safeParse(formData.get("complaintId"));
  if (id.success) revalidatePath(`/lecturer/complaints/${id.data}`);
}

export async function replyAction(_p: ReplyState, formData: FormData): Promise<ReplyState> {
  const r = await staffReply(formData, formData.getAll("files"));
  if (r.ok) refresh(formData);
  return r;
}
export async function statusAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  const r = await changeStatus(formData);
  if (r.ok) refresh(formData);
  return r;
}
export async function escalateAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  const r = await escalate(formData);
  if (r.ok) refresh(formData);
  return r;
}
export async function assignAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  const r = await assignComplaint(formData);
  if (r.ok) { refresh(formData); deliverNotificationsSoon(); } // the newly assigned lecturer is e-mailed
  return r;
}
export async function revokeAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  const r = await revokeAccess(formData);
  if (r.ok) refresh(formData);
  return r;
}
