// Typed, bounded administrator settings (pure). The database only stores jsonb; these rules keep
// values sane (for example, the upload limit can never exceed the 10 MB storage bucket limit).
import { z } from "zod";
import { SUPPORTED_MIMES } from "../attachments/policy";

export const BUCKET_LIMIT_BYTES = 10 * 1024 * 1024;
const DOMAIN = /^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type SettingKind = "int" | "bool" | "mimes" | "domains";
export type SettingDef = { readonly key: string; readonly label: string; readonly help: string; readonly kind: SettingKind; readonly min?: number; readonly max?: number };

export const SETTING_DEFS: readonly SettingDef[] = [
  { key: "max_attachment_size_bytes", label: "Largest single attachment (bytes)", help: "Cannot exceed the 10 MB storage bucket limit; raising it further needs a bucket change.", kind: "int", min: 1024, max: BUCKET_LIMIT_BYTES },
  { key: "max_attachments_per_submission", label: "Attachments per submission or message", help: "Maximum live attachments per uploader.", kind: "int", min: 0, max: 20 },
  { key: "max_request_bytes", label: "Largest upload request (bytes)", help: "Total size of one upload request. Your host may enforce a smaller limit.", kind: "int", min: 1024, max: 100 * 1024 * 1024 },
  { key: "allowed_attachment_mime_types", label: "Allowed attachment types", help: "Only types the server can verify by file signature can be enabled.", kind: "mimes" },
  { key: "allowed_student_email_domains", label: "Allowed student email domains", help: "One per line. Empty means any domain is accepted when registering students.", kind: "domains" },
  { key: "self_registration_enabled", label: "Students and lecturers may register themselves", help: "New accounts are always pending until an administrator approves them. Turning this off does not affect invitations.", kind: "bool" },
  { key: "allow_student_scope_override", label: "Students may choose another level or department", help: "Keeps cross-department complaints possible.", kind: "bool" },
  { key: "complaints_per_hour", label: "Complaints per student per hour", help: "Rate limit.", kind: "int", min: 1, max: 1000 },
  { key: "messages_per_minute", label: "Messages per user per minute", help: "Rate limit.", kind: "int", min: 1, max: 1000 },
  { key: "uploads_per_hour", label: "Uploads per user per hour", help: "Rate limit.", kind: "int", min: 1, max: 5000 },
  { key: "reopen_window_days", label: "Days a student can reopen a resolved complaint", help: "Counted from resolution.", kind: "int", min: 0, max: 365 },
  { key: "overdue_after_days", label: "Days before an open complaint counts as overdue", help: "Used by the reports.", kind: "int", min: 1, max: 365 },
];
export const SETTING_KEYS: readonly string[] = SETTING_DEFS.map((d) => d.key);
export const defOf = (key: string): SettingDef | undefined => SETTING_DEFS.find((d) => d.key === key);

export type SettingResult = { ok: true; value: unknown } | { ok: false; message: string };

/** Validates one raw form value for a known key and returns the jsonb value to store. */
export function parseSettingValue(key: string, raw: unknown): SettingResult {
  const def = defOf(key);
  if (!def) return { ok: false, message: "Unknown setting" };
  if (def.kind === "bool") return { ok: true, value: raw === "on" || raw === "true" };
  if (def.kind === "int") {
    if (typeof raw !== "string" || !/^\d{1,10}$/.test(raw.trim())) return { ok: false, message: "Enter a whole number" };
    const n = Number(raw.trim());
    if (n < (def.min ?? 0) || n > (def.max ?? Number.MAX_SAFE_INTEGER)) return { ok: false, message: `Enter a number from ${def.min} to ${def.max}` };
    return { ok: true, value: n };
  }
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/) : null;
  if (!list) return { ok: false, message: "Invalid value" };
  const items = [...new Set(list.map((s) => (typeof s === "string" ? s.trim().toLowerCase() : "")).filter((s) => s !== ""))];
  if (def.kind === "domains") {
    if (items.length > 50) return { ok: false, message: "At most 50 domains" };
    const bad = items.find((d) => !DOMAIN.test(d));
    return bad ? { ok: false, message: `"${bad.slice(0, 40)}" is not a valid domain` } : { ok: true, value: items };
  }
  const bad = items.find((m) => !SUPPORTED_MIMES.includes(m));
  if (bad) return { ok: false, message: "That file type cannot be verified by the server and cannot be enabled" };
  if (items.length === 0) return { ok: false, message: "Allow at least one file type" };
  return { ok: true, value: items };
}

/** Display text for the form control of a stored jsonb value. */
export function settingToText(def: SettingDef, value: unknown): string {
  if (def.kind === "domains" && Array.isArray(value)) return value.filter((v) => typeof v === "string").join("\n");
  return typeof value === "number" ? String(value) : "";
}
