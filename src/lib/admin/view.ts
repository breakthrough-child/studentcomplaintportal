// Admin list queries and row parsers (pure). Rows from the database are validated before use.
import { z } from "zod";

export const ADMIN_PAGE_SIZE = 25;
export const ADMIN_MAX_PAGE = 2000;

export const adminListSchema = z
  .object({
    q: z.preprocess((v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 80) : undefined), z.string().optional()).transform((v) => (v ? v : undefined)),
    filter: z.preprocess((v) => (typeof v === "string" && /^[a-z_]{1,30}$/.test(v) ? v : undefined), z.string().optional()),
    page: z.preprocess((v) => (typeof v === "string" && /^\d{1,4}$/.test(v) ? Number(v) : 1), z.number().int().min(1).max(ADMIN_MAX_PAGE)),
  })
  .strict();
export type AdminListQuery = z.infer<typeof adminListSchema>;
/** Never throws: anything malformed falls back to the defaults. */
export function parseAdminList(raw: unknown): AdminListQuery {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const parsed = adminListSchema.safeParse({ q: one(r.q), filter: one(r.filter), page: one(r.page) });
  return parsed.success ? parsed.data : { q: undefined, filter: undefined, page: 1 };
}
export const adminRange = (page: number): [number, number] => [(page - 1) * ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE]; // one extra row = look-ahead
export function pageOf<T>(rows: readonly T[]): { items: T[]; hasMore: boolean } {
  return { items: rows.slice(0, ADMIN_PAGE_SIZE), hasMore: rows.length > ADMIN_PAGE_SIZE };
}
/** Escapes % _ \ so user text is matched literally by ILIKE. Commas/parens are removed for PostgREST or() filters. */
export function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, "\\$&").replace(/[,()]/g, " ")}%`;
}
export function adminHref(base: string, q: AdminListQuery, patch: Partial<AdminListQuery>): string {
  const m = { ...q, ...patch };
  const p = new URLSearchParams();
  if (m.q) p.set("q", m.q);
  if (m.filter) p.set("filter", m.filter);
  if (m.page > 1) p.set("page", String(m.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/** Parses rows with a schema; any invalid row fails the whole list closed (null). */
export function parseList<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T>[] | null {
  const r = z.array(schema).safeParse(data);
  return r.success ? r.data : null;
}

const uuid = z.string().uuid();
const ts = z.string().min(10);
export const userRow = z.object({ id: uuid, full_name: z.string(), email: z.string(), role: z.enum(["student", "lecturer", "main_lecturer", "admin"]), is_active: z.boolean(), created_at: ts });
export const USER_COLUMNS = "id,full_name,email,role,is_active,created_at";
export const staffDetailRow = z.object({ profile_id: uuid, department_id: uuid.nullable(), title: z.string().nullable(), accepts_complaints: z.boolean() });
export const STAFF_DETAIL_COLS = "profile_id,department_id,title,accepts_complaints";
export const studentRowSchema = z.object({
  id: uuid, profile_id: uuid.nullable(), school_email: z.string(), full_name: z.string(), registration_number: z.string(),
  level_id: uuid, department_id: uuid, approval_status: z.enum(["pending", "approved", "rejected", "suspended"]), created_at: ts,
});
export const STUDENT_COLS = "id,profile_id,school_email,full_name,registration_number,level_id,department_id,approval_status,created_at";
export const invitationRowSchema = z.object({ id: uuid, email: z.string(), full_name: z.string(), role: z.enum(["lecturer", "main_lecturer", "admin"]), department_id: uuid.nullable(), title: z.string().nullable(), created_at: ts, consumed_at: ts.nullable() });
export const INVITATION_COLS = "id,email,full_name,role,department_id,title,created_at,consumed_at";
export const assignmentRowSchema = z.object({ id: uuid, lecturer_profile_id: uuid, scope_type: z.enum(["institution", "level", "department", "department_level"]), level_id: uuid.nullable(), department_id: uuid.nullable(), is_active: z.boolean(), created_at: ts });
export const ASSIGNMENT_COLS = "id,lecturer_profile_id,scope_type,level_id,department_id,is_active,created_at";
export const auditRowSchema = z.object({ id: uuid, actor_profile_id: uuid.nullable(), action: z.string(), entity_type: z.string(), entity_id: uuid.nullable(), metadata: z.unknown(), created_at: ts });
export const AUDIT_COLS = "id,actor_profile_id,action,entity_type,entity_id,metadata,created_at";
export const settingRowSchema = z.object({ key: z.string(), value: z.unknown(), updated_at: ts });

export type UserRow = z.infer<typeof userRow>;
export type StudentRow = z.infer<typeof studentRowSchema>;
export type InvitationRow = z.infer<typeof invitationRowSchema>;
export type AssignmentRow = z.infer<typeof assignmentRowSchema>;
export type AuditRow = z.infer<typeof auditRowSchema>;

/** Audit metadata for display: bounded JSON text (React escapes it; never rendered as HTML). */
export function auditSummary(metadata: unknown, max = 400): string {
  let s: string;
  try { s = JSON.stringify(metadata ?? {}) ?? "{}"; } catch { s = "{}"; }
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
export const AUDIT_ENTITY_FILTERS = ["profiles", "students", "departments", "academic_levels", "complaint_categories", "lecturer_assignments", "staff_invitations", "staff_details", "app_settings", "complaints"] as const;
