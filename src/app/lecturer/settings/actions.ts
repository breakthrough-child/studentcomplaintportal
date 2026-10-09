// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/staff/actions";
import { updateMySettings } from "@/lib/staff/data";

export async function settingsAction(_p: ActionState, formData: FormData): Promise<ActionState> {
  const r = await updateMySettings(formData);
  if (r.ok) revalidatePath("/lecturer/settings");
  return r;
}
