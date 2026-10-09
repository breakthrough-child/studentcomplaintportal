// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
"use server";

import { revalidatePath } from "next/cache";
import { claimStudentRecord } from "@/lib/student/data";

export type ClaimState = { ok: boolean; message?: string; fieldError?: string };

export async function claimAction(_previous: ClaimState, formData: FormData): Promise<ClaimState> {
  const result = await claimStudentRecord(formData);
  if (result.ok) revalidatePath("/student", "layout");
  return result;
}
