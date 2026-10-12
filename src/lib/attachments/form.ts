// Turning a submitted form into validated uploads (pure; works with any File/Blob-like entries).
import { DEFAULT_POLICY, SUPPORTED_MIMES, checkBatch, validateUpload, type UploadPolicy } from "./policy";

export const BUCKET_LIMIT_BYTES = 10 * 1024 * 1024;
export const FILE_FIELD = "files";

/** Builds the upload policy from app_settings rows. Missing or malformed values fall back to safe defaults. */
export function policyFromSettings(settings: ReadonlyMap<string, unknown>): UploadPolicy {
  const int = (key: string, fallback: number, min: number, max: number): number => {
    const v = settings.get(key);
    return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  };
  const mimes = settings.get("allowed_attachment_mime_types");
  const list = Array.isArray(mimes) ? mimes.filter((m): m is string => typeof m === "string" && SUPPORTED_MIMES.includes(m)) : null;
  return {
    // Never above the storage bucket limit, whatever the setting says.
    maxFileBytes: int("max_attachment_size_bytes", DEFAULT_POLICY.maxFileBytes, 1, BUCKET_LIMIT_BYTES),
    maxFiles: int("max_attachments_per_submission", DEFAULT_POLICY.maxFiles, 0, 20),
    maxRequestBytes: int("max_request_bytes", DEFAULT_POLICY.maxRequestBytes, 1, 100 * 1024 * 1024),
    allowedMimes: list && list.length > 0 ? new Set(list) : DEFAULT_POLICY.allowedMimes,
  };
}

export type FileLike = { readonly name: string; readonly size: number; readonly type: string; arrayBuffer(): Promise<ArrayBuffer> };
const isFileLike = (v: unknown): v is FileLike =>
  typeof v === "object" && v !== null && typeof (v as FileLike).arrayBuffer === "function" && typeof (v as FileLike).name === "string" && typeof (v as FileLike).size === "number";

/**
 * Entries of the file field that the user actually chose. An untouched file input still submits one empty
 * placeholder entry, and its NAME depends on the browser and server runtime ("" from browsers, "undefined"
 * from Next.js Server Actions locally, other values elsewhere). So every zero-byte entry is skipped, whatever
 * it is called: attachments stay optional everywhere, and an empty file carries no evidence anyway.
 */
export function selectedFiles(values: readonly unknown[]): FileLike[] {
  return values.filter(isFileLike).filter((f) => f.size > 0);
}

export type PreparedFile = { readonly displayName: string; readonly mime: string; readonly size: number; readonly bytes: Uint8Array };
export type Prepared = { readonly ok: true; readonly files: PreparedFile[] } | { readonly ok: false; readonly errors: string[] };

/**
 * Validates EVERY file (count, total size, per-file size, extension, signature, declared type, allow-list)
 * before anything is created or stored. One bad file rejects the whole request, so nothing is half-saved.
 */
export async function prepareFiles(values: readonly unknown[], policy: UploadPolicy): Promise<Prepared> {
  const files = selectedFiles(values);
  if (files.length === 0) return { ok: true, files: [] };
  const batch = checkBatch(files.map((f) => f.size), policy);
  if (batch) return { ok: false, errors: [batch] };
  const errors: string[] = [];
  const out: PreparedFile[] = [];
  for (const f of files) {
    if (f.size > policy.maxFileBytes) { errors.push(`${labelOf(f.name)}: the file is too large.`); continue; } // before reading it
    const bytes = new Uint8Array(await f.arrayBuffer());
    const v = validateUpload({ name: f.name, declaredMime: f.type, bytes }, policy);
    if (v.ok) out.push({ displayName: v.displayName, mime: v.mime, size: v.size, bytes });
    else errors.push(`${v.displayName}: ${v.error}`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, files: out };
}
const labelOf = (name: string) => (name.length > 60 ? `${name.slice(0, 57)}...` : name || "file");

/** Message shown when the complaint/message was saved but some files could not be attached. */
export function partialFailureMessage(base: string, failed: readonly string[]): string {
  if (failed.length === 0) return base;
  const names = failed.slice(0, 5).join(", ");
  return `${base} However, ${failed.length === 1 ? "this file was" : `${failed.length} files were`} not attached: ${names}. You can add ${failed.length === 1 ? "it" : "them"} in a reply.`;
}
