// Pure helpers for the download route and delete action.
import { z } from "zod";

export const SIGNED_URL_SECONDS = 60;
const idSchema = z.string().uuid();

/** Only a well-formed UUID reaches the database; anything else is treated as "not found". */
export function parseAttachmentId(raw: unknown): string | null {
  const r = idSchema.safeParse(raw);
  return r.success ? r.data.toLowerCase() : null;
}

export const AREAS = ["student", "lecturer"] as const;
export const deleteAttachmentSchema = z.object({ attachmentId: idSchema, complaintId: idSchema, area: z.enum(AREAS) }).strict();
export function parseDeleteAttachment(source: { get(name: string): unknown }) {
  const pick = (k: string) => { const v = source.get(k); return v === null ? undefined : v; };
  return deleteAttachmentSchema.safeParse({ attachmentId: pick("attachmentId"), complaintId: pick("complaintId"), area: pick("area") });
}
/** The page to refresh after a deletion; built from validated parts only. */
export function detailPath(area: (typeof AREAS)[number], complaintId: string): string {
  return area === "student" ? `/student/complaints/${complaintId}` : `/lecturer/complaints/${complaintId}`;
}
