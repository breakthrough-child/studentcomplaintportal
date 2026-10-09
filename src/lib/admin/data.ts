// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import type { Profile } from "@/lib/auth/profile";
import { fieldErrors } from "@/lib/validation/form";
import { mapAdminError, type AdminContext } from "./errors";
import { sendInvite } from "./invite";
import { validateStudentCsv, type CsvRowResult } from "./csv";
import {
  assignmentRow, departmentRow, categoryRow, invitationRow, levelRow, parseAssignment, parseAssignmentDelete, parseAssignmentToggle,
  parseCategory, parseDepartment, parseInviteStudent, parseLevel, parseResendInvite, parseStaffInvite, parseStudentCreate,
  parseStudentUpdate, parseUserUpdate, studentInsertRow, studentUpdateRow, userUpdateRow, type AdminState, type Src,
} from "./schemas";
import { parseSettingValue } from "./settings";
import {
  ADMIN_PAGE_SIZE, ASSIGNMENT_COLS, AUDIT_COLS, INVITATION_COLS, STAFF_DETAIL_COLS, STUDENT_COLS, USER_COLUMNS,
  adminRange, assignmentRowSchema, auditRowSchema, invitationRowSchema, likeTerm, pageOf, parseAdminList, parseList, settingRowSchema,
  staffDetailRow, studentRowSchema, userRow, type AdminListQuery,
} from "./view";

export const requireAdmin = (): Promise<Profile> => requireRole(["admin"]);

const FAIL: AdminState = { ok: false, message: "That could not be loaded. Please try again." };
type Err = { code?: string } | null;
const done = (error: Err, ctx: AdminContext, okMessage: string): AdminState => (error ? { ok: false, message: mapAdminError(error, ctx) } : { ok: true, message: okMessage });
const invalid = (e: Parameters<typeof fieldErrors>[0]): AdminState => ({ ok: false, message: "Please correct the highlighted fields.", fieldErrors: fieldErrors(e) });

// ---- reference data (departments, levels, categories) ------------------------------------
export async function loadAdminReference() {
  await requireAdmin();
  const s = await createClient();
  const [l, d, c] = await Promise.all([
    s.from("academic_levels").select("id,name,level_number,is_active").order("level_number"),
    s.from("departments").select("id,name,code,description,is_active").order("name"),
    s.from("complaint_categories").select("id,name,description,is_sensitive,is_active").order("created_at"),
  ]);
  if (l.error || d.error || c.error) return null;
  return { levels: l.data, departments: d.data, categories: c.data };
}

async function upsert(table: "departments" | "academic_levels" | "complaint_categories", id: string | null, row: object, ctx: AdminContext, what: string): Promise<AdminState> {
  const s = await createClient();
  const { error } = id ? await s.from(table).update(row).eq("id", id) : await s.from(table).insert(row);
  return done(error, ctx, id ? `${what} updated.` : `${what} created.`);
}
export async function saveDepartment(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseDepartment(src);
  return p.success ? upsert("departments", p.data.id, departmentRow(p.data), "department", "Department") : invalid(p.error);
}
export async function saveLevel(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseLevel(src);
  return p.success ? upsert("academic_levels", p.data.id, levelRow(p.data), "level", "Level") : invalid(p.error);
}
export async function saveCategory(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseCategory(src);
  return p.success ? upsert("complaint_categories", p.data.id, categoryRow(p.data), "category", "Category") : invalid(p.error);
}

// ---- dashboard ----------------------------------------------------------------------------
export async function getAdminDashboard() {
  await requireAdmin();
  const s = await createClient();
  const head = (t: "profiles" | "students" | "staff_invitations" | "lecturer_assignments" | "audit_logs") => s.from(t).select("id", { count: "exact", head: true });
  const [users, pending, students, invites, assigns, audit] = await Promise.all([
    head("profiles"),
    s.from("students").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
    head("students"),
    s.from("staff_invitations").select("id", { count: "exact", head: true }).is("consumed_at", null),
    s.from("lecturer_assignments").select("id", { count: "exact", head: true }).eq("is_active", true),
    head("audit_logs"),
  ]);
  if ([users, pending, students, invites, assigns, audit].some((r) => r.error)) return null;
  return { users: users.count ?? 0, pendingStudents: pending.count ?? 0, students: students.count ?? 0, openInvitations: invites.count ?? 0, activeAssignments: assigns.count ?? 0, auditEntries: audit.count ?? 0 };
}

// ---- users ---------------------------------------------------------------------------------
export async function listUsers(raw: unknown) {
  await requireAdmin();
  const q = parseAdminList(raw);
  const s = await createClient();
  let query = s.from("profiles").select(USER_COLUMNS).order("created_at", { ascending: false });
  if (q.filter && ["student", "lecturer", "main_lecturer", "admin"].includes(q.filter)) query = query.eq("role", q.filter as "student");
  if (q.filter === "inactive") query = query.eq("is_active", false);
  if (q.q) query = query.or(`full_name.ilike.${likeTerm(q.q)},email.ilike.${likeTerm(q.q)}`);
  const [from, to] = adminRange(q.page);
  const { data, error } = await query.range(from, to);
  const rows = error ? null : parseList(userRow, data);
  return rows ? { ok: true as const, query: q, ...pageOf(rows) } : { ok: false as const, query: q };
}
export async function updateUser(src: Src): Promise<AdminState> {
  const me = await requireAdmin();
  const p = parseUserUpdate(src);
  if (!p.success) return invalid(p.error);
  if (p.data.id === me.id) return { ok: false, message: "You cannot change your own account here." };
  const { error } = await (await createClient()).from("profiles").update(userUpdateRow(p.data)).eq("id", p.data.id);
  return done(error, "user", "User updated.");
}

// ---- students ------------------------------------------------------------------------------
export async function listStudents(raw: unknown) {
  await requireAdmin();
  const q = parseAdminList(raw);
  const s = await createClient();
  let query = s.from("students").select(STUDENT_COLS).order("created_at", { ascending: false });
  if (q.filter && ["pending", "approved", "rejected", "suspended"].includes(q.filter)) query = query.eq("approval_status", q.filter as "pending");
  if (q.filter === "unlinked") query = query.is("profile_id", null);
  if (q.q) query = query.or(`full_name.ilike.${likeTerm(q.q)},school_email.ilike.${likeTerm(q.q)},registration_number.ilike.${likeTerm(q.q)}`);
  const [from, to] = adminRange(q.page);
  const { data, error } = await query.range(from, to);
  const rows = error ? null : parseList(studentRowSchema, data);
  return rows ? { ok: true as const, query: q, ...pageOf(rows) } : { ok: false as const, query: q };
}
export async function createStudent(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseStudentCreate(src);
  if (!p.success) return invalid(p.error);
  const { error } = await (await createClient()).from("students").insert(studentInsertRow(p.data));
  return done(error, "student", "Student registered. Send an invitation so they can set a password.");
}
export async function updateStudent(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseStudentUpdate(src);
  if (!p.success) return invalid(p.error);
  const { error } = await (await createClient()).from("students").update(studentUpdateRow(p.data)).eq("id", p.data.id);
  return done(error, "student", "Student updated.");
}
/** Sends the invitation e-mail for a pre-registered, not-yet-linked student. */
export async function inviteStudent(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseInviteStudent(src);
  if (!p.success) return invalid(p.error);
  const { data, error } = await (await createClient()).from("students").select("school_email,profile_id").eq("id", p.data.id).maybeSingle();
  if (error || !data) return { ok: false, message: "That student could not be found." };
  if (data.profile_id) return { ok: false, message: "This student already has an account." };
  const r = await sendInvite(data.school_email);
  return r.ok ? { ok: true, message: "Invitation sent." } : { ok: false, message: r.message };
}
export type ImportState = AdminState & { readonly rows?: readonly CsvRowResult[]; readonly created?: number };
/** Validates the CSV against live reference data, then inserts every valid row. Invalid rows are reported, not skipped silently. */
export async function importStudents(csvText: string, commit: boolean): Promise<ImportState> {
  await requireAdmin();
  const ref = await loadAdminReference();
  if (!ref) return FAIL;
  const v = validateStudentCsv(csvText, ref.levels.map((l) => ({ id: l.id, name: l.name, levelNumber: l.level_number })), ref.departments.map((d) => ({ id: d.id, name: d.name })));
  if (!v.ok) return { ok: false, message: v.error };
  const good = v.rows.flatMap((r) => (r.ok ? [r.values] : []));
  const bad = v.rows.length - good.length;
  if (!commit) return { ok: bad === 0, message: bad === 0 ? `${good.length} rows are valid and ready to import.` : `${bad} row(s) have problems. Fix the file and check again; nothing was imported.`, rows: v.rows };
  if (bad > 0) return { ok: false, message: "Fix the invalid rows before importing. Nothing was imported.", rows: v.rows };
  const { error } = await (await createClient()).from("students").insert(good as never);
  return error ? { ok: false, message: mapAdminError(error, "student"), rows: v.rows } : { ok: true, message: `${good.length} students registered.`, created: good.length };
}

// ---- staff and invitations ---------------------------------------------------------------
export async function listStaff() {
  await requireAdmin();
  const s = await createClient();
  const [u, d, i] = await Promise.all([
    s.from("profiles").select(USER_COLUMNS).in("role", ["lecturer", "main_lecturer"]).order("full_name"),
    s.from("staff_details").select(STAFF_DETAIL_COLS),
    s.from("staff_invitations").select(INVITATION_COLS).order("created_at", { ascending: false }).limit(100),
  ]);
  const users = u.error ? null : parseList(userRow, u.data);
  const details = d.error ? null : parseList(staffDetailRow, d.data);
  const invitations = i.error ? null : parseList(invitationRowSchema, i.data);
  return users && details && invitations ? { ok: true as const, users, details, invitations } : { ok: false as const };
}
export async function inviteStaff(src: Src): Promise<AdminState> {
  const me = await requireAdmin();
  const p = parseStaffInvite(src);
  if (!p.success) return invalid(p.error);
  const s = await createClient();
  const { error } = await s.from("staff_invitations").insert({ ...invitationRow(p.data), created_by: me.id });
  if (error) return { ok: false, message: mapAdminError(error, "invitation") };
  const sent = await sendInvite(p.data.email);
  return sent.ok ? { ok: true, message: "Invitation recorded and e-mail sent." } : { ok: false, message: sent.message };
}
export async function resendStaffInvite(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseResendInvite(src);
  if (!p.success) return invalid(p.error);
  const { data, error } = await (await createClient()).from("staff_invitations").select("id").ilike("email", p.data.email).is("consumed_at", null).maybeSingle();
  if (error || !data) return { ok: false, message: "There is no open invitation for that email." };
  const sent = await sendInvite(p.data.email);
  return sent.ok ? { ok: true, message: "Invitation e-mail sent again." } : { ok: false, message: sent.message };
}
export async function cancelInvitation(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseResendInvite(src);
  if (!p.success) return invalid(p.error);
  const { error } = await (await createClient()).from("staff_invitations").delete().ilike("email", p.data.email).is("consumed_at", null);
  return done(error, "invitation", "Invitation cancelled.");
}

// ---- assignments -------------------------------------------------------------------------
export async function listAssignments() {
  await requireAdmin();
  const s = await createClient();
  const [a, u] = await Promise.all([
    s.from("lecturer_assignments").select(ASSIGNMENT_COLS).order("created_at", { ascending: false }).limit(500),
    s.from("profiles").select(USER_COLUMNS).in("role", ["lecturer", "main_lecturer"]).eq("is_active", true).order("full_name"),
  ]);
  const rows = a.error ? null : parseList(assignmentRowSchema, a.data);
  const lecturers = u.error ? null : parseList(userRow, u.data);
  return rows && lecturers ? { ok: true as const, rows, lecturers } : { ok: false as const };
}
export async function createAssignment(src: Src): Promise<AdminState> {
  const me = await requireAdmin();
  const p = parseAssignment(src);
  if (!p.success) return invalid(p.error);
  const { error } = await (await createClient()).from("lecturer_assignments").insert({ ...assignmentRow(p.data), created_by: me.id });
  return done(error, "assignment", "Assignment added.");
}
export async function toggleAssignment(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseAssignmentToggle(src);
  if (!p.success) return invalid(p.error);
  const { error } = await (await createClient()).from("lecturer_assignments").update({ is_active: p.data.isActive }).eq("id", p.data.id);
  return done(error, "assignment", p.data.isActive ? "Assignment activated." : "Assignment deactivated.");
}
export async function deleteAssignment(src: Src): Promise<AdminState> {
  await requireAdmin();
  const p = parseAssignmentDelete(src);
  if (!p.success) return invalid(p.error);
  const { error } = await (await createClient()).from("lecturer_assignments").delete().eq("id", p.data.id);
  return done(error, "assignment", "Assignment removed.");
}

// ---- audit logs and settings -------------------------------------------------------------
export async function listAudit(raw: unknown) {
  await requireAdmin();
  const q: AdminListQuery = parseAdminList(raw);
  const s = await createClient();
  let query = s.from("audit_logs").select(AUDIT_COLS).order("created_at", { ascending: false });
  if (q.filter && /^[a-z_]{1,30}$/.test(q.filter)) query = query.eq("entity_type", q.filter);
  if (q.q) query = query.ilike("action", likeTerm(q.q));
  const [from, to] = adminRange(q.page);
  const { data, error } = await query.range(from, to);
  const rows = error ? null : parseList(auditRowSchema, data);
  if (!rows) return { ok: false as const, query: q };
  const page = pageOf(rows);
  const ids = [...new Set(page.items.flatMap((r) => (r.actor_profile_id ? [r.actor_profile_id] : [])))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await s.from("profiles").select("id,full_name").in("id", ids);
    for (const r of people ?? []) names.set(r.id, r.full_name);
  }
  return { ok: true as const, query: q, ...page, names };
}
export async function loadSettings() {
  await requireAdmin();
  const { data, error } = await (await createClient()).from("app_settings").select("key,value,updated_at");
  const rows = error ? null : parseList(settingRowSchema, data);
  return rows ? new Map(rows.map((r) => [r.key, r.value])) : null;
}
export async function saveSetting(src: Src): Promise<AdminState> {
  await requireAdmin();
  const key = src.get("key");
  if (typeof key !== "string") return { ok: false, message: "Unknown setting." };
  const raw = key === "allowed_attachment_mime_types" && "getAll" in src && typeof (src as { getAll?: unknown }).getAll === "function" ? (src as unknown as FormData).getAll("value") : src.get("value");
  const v = parseSettingValue(key, raw);
  if (!v.ok) return { ok: false, message: v.message, fieldErrors: { value: v.message } };
  const { data, error } = await (await createClient()).from("app_settings").update({ value: v.value as never }).eq("key", key).select("key");
  if (error) return { ok: false, message: mapAdminError(error, "setting") };
  return data && data.length > 0 ? { ok: true, message: "Setting saved." } : { ok: false, message: "Unknown setting." };
}
export { ADMIN_PAGE_SIZE };
