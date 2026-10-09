// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/guards";
import { detailPath, parseDeleteAttachment } from "@/lib/attachments/download";
import { mapRpcError } from "@/lib/complaints/rpc-errors";
import type { ActionState } from "@/lib/staff/actions";

/** Soft-deletes the caller's own attachment through delete_attachment (it re-checks ownership and the closed state). */
export async function deleteAttachmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const p = parseDeleteAttachment(formData);
  if (!p.success) return { ok: false, message: "That file could not be removed." };
  const { error } = await (await createClient()).rpc("delete_attachment", { p_attachment_id: p.data.attachmentId });
  if (error) return { ok: false, message: mapRpcError(error, "staff").message };
  revalidatePath(detailPath(p.data.area, p.data.complaintId));
  return { ok: true, message: "File removed." };
}
