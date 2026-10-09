// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
"use server";

import { submitComplaint } from "@/lib/complaints/data";
import type { SubmitComplaintState } from "@/lib/complaints/schema";

export async function submitComplaintAction(_previous: SubmitComplaintState, formData: FormData): Promise<SubmitComplaintState> {
  return submitComplaint(formData);
}
