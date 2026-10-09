// UNVERIFIED: depends on next and @supabase/ssr, which could not be installed when this was written.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth/guards";
import { BUCKET } from "@/lib/attachments/upload";
import { parseAttachmentId, SIGNED_URL_SECONDS } from "@/lib/attachments/download";

/**
 * Authorised download. Everything runs as the SIGNED-IN USER (no service role):
 *  1. the attachment row is read under RLS, so only people who can access the complaint (and only
 *     for files that are not deleted) get a row; anyone else gets the same 404 as a missing id;
 *  2. the signed URL is created with the user's session, so the storage SELECT policy
 *     (storage_object_readable) must also allow it;
 *  3. the URL is short-lived, forces a download with the sanitised stored name, and is never cached.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const id = parseAttachmentId((await params).id);
  if (!id) return notFound();
  if (!(await getSessionUser())) return new NextResponse("Unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });

  const supabase = await createClient();
  const { data, error } = await supabase.from("complaint_attachments").select("storage_path,original_filename").eq("id", id).maybeSingle();
  if (error || !data) return notFound();

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(data.storage_path, SIGNED_URL_SECONDS, { download: data.original_filename });
  if (signed.error || !signed.data?.signedUrl) return notFound();
  return new NextResponse(null, { status: 302, headers: { Location: signed.data.signedUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
