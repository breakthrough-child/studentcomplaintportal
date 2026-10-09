// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
"use server";

import { revalidatePath } from "next/cache";
import { replyToComplaint } from "@/lib/complaints/student-data";
import type { ReplyState } from "@/lib/complaints/reply";
import { complaintIdSchema } from "@/lib/complaints/student-view";

export async function replyAction(_previous: ReplyState, formData: FormData): Promise<ReplyState> {
  const result = await replyToComplaint(formData, formData.getAll("files"));
  const id = complaintIdSchema.safeParse(formData.get("complaintId"));
  if (result.ok && id.success) revalidatePath(`/student/complaints/${id.data}`);
  return result;
}
