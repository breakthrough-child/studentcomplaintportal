// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { prepareFiles, policyFromSettings, type Prepared, type PreparedFile } from "./form";
import { storagePath, type UploadPolicy } from "./policy";

export const BUCKET = "complaint-evidence";

/** Upload limits from app_settings (readable by every signed-in role); safe defaults if unreadable. */
export async function loadUploadPolicy(): Promise<UploadPolicy> {
  const { data } = await (await createClient()).from("app_settings").select("key,value").in("key", [
    "max_attachment_size_bytes", "max_attachments_per_submission", "max_request_bytes", "allowed_attachment_mime_types",
  ]);
  return policyFromSettings(new Map((data ?? []).map((r) => [r.key, r.value])));
}

/** Step 1 (before anything is created): validate every submitted file against the live policy. */
export async function validateSubmittedFiles(values: readonly unknown[]): Promise<Prepared> {
  if (values.length === 0) return { ok: true, files: [] };
  return prepareFiles(values, await loadUploadPolicy());
}

/**
 * Step 2 (after the complaint/message exists): upload each file with the USER'S OWN session, so the
 * storage insert policy (storage_upload_allowed) decides whether they may write to this complaint's folder,
 * then register it through register_attachment (which re-checks access, size, type, counts and rate limits).
 * No service role is involved. Returns the display names of files that could not be attached.
 *
 * A failed registration leaves an unreferenced object in the private bucket (the user has no delete
 * policy); removing such orphans is the job of the trusted purge task described in the README.
 */
export async function storeFiles(complaintId: string, messageId: string | null, files: readonly PreparedFile[]): Promise<string[]> {
  const failed: string[] = [];
  const supabase = await createClient();
  for (const f of files) {
    const path = storagePath(complaintId, randomUUID());
    if (!path) { failed.push(f.displayName); continue; }
    const up = await supabase.storage.from(BUCKET).upload(path, f.bytes, { contentType: f.mime, upsert: false, cacheControl: "0" });
    if (up.error) { failed.push(f.displayName); continue; }
    const reg = await supabase.rpc("register_attachment", {
      p_complaint_id: complaintId, p_message_id: messageId as string, p_storage_path: path,
      p_original_filename: f.displayName, p_mime_type: f.mime, p_file_size: f.size,
    });
    if (reg.error) failed.push(f.displayName);
  }
  return failed;
}
