// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
"use server";

import { submitComplaint } from "@/lib/complaints/data";
import type { SubmitComplaintState } from "@/lib/complaints/schema";
import { deliverNotificationsSoon } from "@/lib/notifications/send";

export async function submitComplaintAction(_previous: SubmitComplaintState, formData: FormData): Promise<SubmitComplaintState> {
  const r = await submitComplaint(formData, formData.getAll("files"));
  // The database queued the lecturer's e-mail with the complaint; send it after responding.
  if (r.ok) deliverNotificationsSoon();
  return r;
}
