// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import type { Profile } from "@/lib/auth/profile";
import { getUnread, getStatusTotals } from "@/lib/complaints/overview-data";
import { academicLevelSchema, categorySchema, departmentSchema, parseRows, selectableLevels, selectableDepartments, type AcademicLevel, type Category, type Department } from "@/lib/complaints/options";
import { buildReplyRpcArgs, echoReplyBody, parseReply, type ReplyState } from "@/lib/complaints/reply";
import { mapRpcError } from "@/lib/complaints/rpc-errors";
import { GENERIC_ERROR, complaintIdSchema, containsPattern, searchColumn } from "@/lib/complaints/student-view";
import { fieldErrors } from "@/lib/validation/form";
import { partialFailureMessage } from "@/lib/attachments/form";
import { storeFiles, validateSubmittedFiles } from "@/lib/attachments/upload";
import {
  assignArgs, escalateArgs, parseAssign, parseEscalate, parseRevoke, parseStatusChange, revokeArgs, statusArgs, type ActionState,
} from "./actions";
import {
  ACCESS_COLUMNS, ATTACHMENT_COLUMNS, EVENT_COLUMNS, HISTORY_COLUMNS, MESSAGE_COLUMNS, STAFF_DETAIL_COLUMNS, STAFF_LIST_COLUMNS, STAFF_PAGE_SIZE,
  buildConversation, buildTimeline, dateBounds, parseAccessGrants, parseAssignable, parseAttachments, parseNameMap, parseOverdue, parseScopeCounts,
  parseStaffDetail, parseStaffList, parseStaffQuery, parseTrend, staffRange, unreadIds,
  type AccessGrant, type AssignableLecturer, type AttachmentView, type ConversationMessage, type OverdueItem, type Rollup, type StaffDetail,
  type StaffQuery, type StaffSummary, type TimelineEntry, type TrendDay,
} from "./view";
import { rollup } from "./view";
import { SETTINGS_COLUMNS, ASSIGNMENT_COLUMNS, describeScope, parseAssignments, parseSettingsRow, parseStaffSettings, settingsUpdate } from "./settings";

export const requireStaff = (): Promise<Profile> => requireRole(["lecturer", "main_lecturer"]);
export const requireMainLecturer = (): Promise<Profile> => requireRole(["main_lecturer"]);

export type Reference = { levels: AcademicLevel[]; departments: Department[]; categories: Category[]; activeLevels: AcademicLevel[]; activeDepartments: Department[] };

/** Reference lists (names for every row, plus the active subset for navigation). */
export async function loadReference(): Promise<Reference | null> {
  const supabase = await createClient();
  const [l, d, c] = await Promise.all([
    supabase.from("academic_levels").select("id,name,level_number,is_active"),
    supabase.from("departments").select("id,name,code,is_active"),
    supabase.from("complaint_categories").select("id,name,description,is_sensitive,is_active").order("created_at", { ascending: true }),
  ]);
  if (l.error || d.error || c.error) return null;
  const levels = parseRows(academicLevelSchema, l.data);
  const departments = parseRows(departmentSchema, d.data);
  const categories = parseRows(categorySchema, c.data);
  if (!levels || !departments || !categories) return null;
  return {
    levels: [...levels].sort((a, b) => a.level_number - b.level_number), departments, categories,
    activeLevels: selectableLevels(levels), activeDepartments: selectableDepartments(departments),
  };
}

export type StaffRow = StaffSummary & { studentName: string; unread: number; neverOpened: boolean };
export type StaffListResult =
  | { state: "ok"; items: StaffRow[]; hasMore: boolean; query: StaffQuery }
  | { state: "empty"; query: StaffQuery }
  | { state: "error"; message: string; query: StaffQuery };

async function studentNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  // RLS (can_view_student) decides which students this staff member may read at all.
  const { data, error } = await supabase.from("students").select("id,name:full_name").in("id", ids);
  return (!error && parseNameMap(data)) || new Map();
}

/** The complaints this staff member is authorised to see, narrowed by the requested filters. */
export async function listStaffComplaints(rawQuery: unknown, fixed: Partial<Pick<StaffQuery, "levelId" | "departmentId" | "view">> = {}): Promise<StaffListResult> {
  await requireStaff();
  const query = parseStaffQuery(rawQuery, fixed);
  const err = (message: string): StaffListResult => ({ state: "error", message, query });
  const unread = await getUnread();

  const supabase = await createClient();
  let q = supabase.from("complaints").select(STAFF_LIST_COLUMNS);
  if (query.levelId) q = q.eq("level_id", query.levelId);
  if (query.departmentId) q = q.eq("department_id", query.departmentId);
  if (query.categoryId) q = q.eq("category_id", query.categoryId);
  if (query.status) q = q.eq("status", query.status);
  if (query.q) q = q.ilike(searchColumn(query.q), containsPattern(query.q));
  if (query.priority) q = q.eq("priority", query.priority);
  const bounds = dateBounds(query);
  if (bounds.gte) q = q.gte("created_at", bounds.gte);
  if (bounds.lt) q = q.lt("created_at", bounds.lt);
  if (query.view === "new") q = q.in("status", ["submitted", "reopened"]);
  if (query.view === "awaiting") q = q.eq("status", "awaiting_student");
  if (query.view === "triage") q = q.eq("requires_triage", true);
  if (query.view === "unread") {
    const ids = unreadIds(unread.byComplaint);
    if (ids.length === 0) return { state: "empty", query };
    q = q.in("id", ids);
  }
  const { from, to } = staffRange(query.page);
  const ordered =
    query.sort === "newest" ? q.order("created_at", { ascending: false })
    : query.sort === "oldest" ? q.order("created_at", { ascending: true })
    : query.sort === "priority" ? q.order("priority", { ascending: false }).order("last_activity_at", { ascending: false })
    : q.order("last_activity_at", { ascending: false });
  const { data, error } = await ordered.order("id", { ascending: false }).range(from, to);
  if (error) return err(GENERIC_ERROR);
  const rows = parseStaffList(data);
  if (!rows) return err(GENERIC_ERROR);
  if (rows.length === 0) return { state: "empty", query };

  const page = rows.slice(0, STAFF_PAGE_SIZE);
  const names = await studentNames([...new Set(page.map((r) => r.studentId))]);
  const items = page.map((r) => ({
    ...r,
    studentName: names.get(r.studentId) ?? "Student",
    unread: unread.byComplaint.get(r.id)?.unread ?? 0,
    neverOpened: unread.byComplaint.get(r.id)?.neverOpened ?? false,
  }));
  return { state: "ok", items, hasMore: rows.length > STAFF_PAGE_SIZE, query };
}

export type StaffDashboard = {
  totals: Awaited<ReturnType<typeof getStatusTotals>>;
  attention: number;
  recent: StaffListResult;
};

export async function getStaffDashboard(): Promise<StaffDashboard> {
  await requireStaff();
  const [totals, unread, recent] = await Promise.all([getStatusTotals(), getUnread(), listStaffComplaints({})]);
  return { totals, attention: unread.attention, recent };
}

export type StaffComplaintView =
  | {
      state: "ok"; me: Profile; complaint: StaffDetail; studentName: string; categoryName: string | null; recipientName: string | null;
      conversation: ConversationMessage[]; attachments: AttachmentView[]; timeline: TimelineEntry[]; access: (AccessGrant & { name: string })[];
      levelName: string | null; departmentName: string | null;
    }
  | { state: "not_found" }
  | { state: "error"; message: string };

export async function getStaffComplaint(rawId: unknown): Promise<StaffComplaintView> {
  const me = await requireStaff();
  const id = complaintIdSchema.safeParse(rawId);
  if (!id.success) return { state: "not_found" };
  const supabase = await createClient();
  const found = await supabase.from("complaints").select(STAFF_DETAIL_COLUMNS).eq("id", id.data).maybeSingle();
  if (found.error) return { state: "error", message: GENERIC_ERROR };
  if (!found.data) return { state: "not_found" }; // missing and not-authorised look the same
  const complaint = parseStaffDetail(found.data);
  if (!complaint) return { state: "error", message: GENERIC_ERROR };

  const [msgs, atts, hist, evts, acc, ref] = await Promise.all([
    supabase.from("complaint_messages").select(MESSAGE_COLUMNS).eq("complaint_id", complaint.id).order("created_at", { ascending: true }),
    supabase.from("complaint_attachments").select(ATTACHMENT_COLUMNS).eq("complaint_id", complaint.id),
    supabase.from("complaint_status_history").select(HISTORY_COLUMNS).eq("complaint_id", complaint.id).order("created_at", { ascending: true }),
    supabase.from("complaint_events").select(EVENT_COLUMNS).eq("complaint_id", complaint.id).order("created_at", { ascending: true }),
    supabase.from("complaint_access").select(ACCESS_COLUMNS).eq("complaint_id", complaint.id),
    loadReference(),
  ]);
  if (msgs.error || atts.error || hist.error || evts.error) return { state: "error", message: GENERIC_ERROR };

  const grants = acc.error ? [] : (parseAccessGrants(acc.data) ?? []);
  const authorIds = new Set<string>([complaint.targetLecturerId, ...grants.map((g) => g.profileId)]);
  for (const m of (Array.isArray(msgs.data) ? msgs.data : []) as { author_profile_id?: string }[]) if (m.author_profile_id) authorIds.add(m.author_profile_id);
  for (const h of (Array.isArray(hist.data) ? hist.data : []) as { actor_profile_id?: string | null }[]) if (h.actor_profile_id) authorIds.add(h.actor_profile_id);
  // Names only for profiles can_view_profile lets this user read; others fall back to generic labels.
  const profiles = await supabase.from("profiles").select("id,name:full_name").in("id", [...authorIds]);
  const names = (!profiles.error && parseNameMap(profiles.data)) || new Map<string, string>();

  const student = await supabase.from("students").select("id,name:full_name,profile_id").eq("id", complaint.studentId).maybeSingle();
  const studentName = !student.error && student.data ? ((student.data as { name?: string }).name ?? "Student") : "Student";
  const studentProfileId = !student.error && student.data ? ((student.data as { profile_id?: string | null }).profile_id ?? null) : null;

  const attachments = parseAttachments(atts.data, me.id);
  const conversation = attachments ? buildConversation(msgs.data, names, me.id, studentProfileId, attachments) : null;
  const timeline = buildTimeline(hist.data, evts.data, names);
  if (!attachments || !conversation || !timeline) return { state: "error", message: GENERIC_ERROR };

  // Opening a complaint marks it read for this user (their own receipt only). Best effort.
  await supabase.rpc("mark_complaint_read", { p_complaint_id: complaint.id });

  return {
    state: "ok", me, complaint, studentName,
    categoryName: ref?.categories.find((c) => c.id === complaint.categoryId)?.name ?? null,
    recipientName: names.get(complaint.targetLecturerId) ?? null,
    levelName: ref?.levels.find((l) => l.id === complaint.levelId)?.name ?? null,
    departmentName: ref?.departments.find((d) => d.id === complaint.departmentId)?.name ?? null,
    conversation, attachments, timeline,
    access: grants.map((g) => ({ ...g, name: names.get(g.profileId) ?? "Lecturer" })),
  };
}

// ---- mutations: parse -> RPC -> fixed message ---------------------------------------------
function failed(error: unknown): ActionState {
  return { ok: false, message: mapRpcError(error, "staff").message };
}

export async function staffReply(source: { get(name: string): unknown }, fileValues: readonly unknown[] = []): Promise<ReplyState> {
  await requireStaff();
  const body = echoReplyBody(source);
  const parsed = parseReply(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), body };
  const prepared = await validateSubmittedFiles(fileValues);
  if (!prepared.ok) return { ok: false, fieldErrors: { files: prepared.errors.join(" ") }, body };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_message", buildReplyRpcArgs(parsed.data));
  if (error) return { ok: false, message: mapRpcError(error, "reply").message, body };
  const failed = prepared.files.length > 0 && typeof data === "string" ? await storeFiles(parsed.data.complaintId, data, prepared.files) : [];
  return { ok: true, message: partialFailureMessage("Your reply was sent.", failed) };
}

export async function changeStatus(source: { get(name: string): unknown }): Promise<ActionState> {
  await requireStaff();
  const parsed = parseStatusChange(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).rpc("transition_complaint_status", statusArgs(parsed.data));
  return error ? failed(error) : { ok: true, message: "Status updated." };
}

export async function escalate(source: { get(name: string): unknown }): Promise<ActionState> {
  await requireStaff();
  const parsed = parseEscalate(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).rpc("escalate_complaint", escalateArgs(parsed.data));
  return error ? failed(error) : { ok: true, message: "Escalated to a main lecturer for triage." };
}

export async function assignComplaint(source: { get(name: string): unknown }): Promise<ActionState> {
  await requireMainLecturer();
  const parsed = parseAssign(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).rpc("assign_complaint", assignArgs(parsed.data));
  return error ? failed(error) : { ok: true, message: "Complaint assigned." };
}

export async function revokeAccess(source: { get(name: string): unknown }): Promise<ActionState> {
  await requireMainLecturer();
  const parsed = parseRevoke(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).rpc("revoke_complaint_access", revokeArgs(parsed.data));
  return error ? failed(error) : { ok: true, message: "Access removed." };
}

// ---- main lecturer: assignable lecturers and reports ---------------------------------------
export async function listAssignableLecturers(search?: string): Promise<AssignableLecturer[] | null> {
  await requireMainLecturer();
  const text = typeof search === "string" ? search.slice(0, 100) : null;
  const { data, error } = await (await createClient()).rpc("list_assignable_lecturers", { p_query: text && text.trim() ? text.trim() : null, p_limit: 100 });
  return error ? null : parseAssignable(data);
}

export type Reports = {
  totals: Awaited<ReturnType<typeof getStatusTotals>>;
  byLevel: Rollup[] | null; byDepartment: Rollup[] | null; trend: TrendDay[] | null; overdue: OverdueItem[] | null;
  overdueAfterDays: number | null; reference: Reference | null;
};

export async function getReports(): Promise<Reports> {
  await requireMainLecturer();
  const supabase = await createClient();
  const [totals, scope, trend, overdue, days, reference] = await Promise.all([
    getStatusTotals(),
    supabase.rpc("complaint_counts_by_scope"),
    supabase.rpc("complaint_daily_trend", { p_days: 30 }),
    supabase.rpc("list_overdue_complaints", { p_days: null }),
    supabase.rpc("overdue_after_days"),
    loadReference(),
  ]);
  const rows = scope.error ? null : parseScopeCounts(scope.data);
  return {
    totals,
    byLevel: rows ? rollup(rows, "levelId") : null,
    byDepartment: rows ? rollup(rows, "departmentId") : null,
    trend: trend.error ? null : parseTrend(trend.data),
    overdue: overdue.error ? null : parseOverdue(overdue.data),
    overdueAfterDays: days.error || typeof days.data !== "number" ? null : days.data,
    reference,
  };
}

// ---- lecturer settings ----------------------------------------------------------------------

export type SettingsView =
  | { ok: true; title: string; acceptsComplaints: boolean; departmentName: string | null; scopes: string[] }
  | { ok: false };

export async function getMySettings(): Promise<SettingsView> {
  const me = await requireStaff();
  const supabase = await createClient();
  const [details, assignments, ref] = await Promise.all([
    supabase.from("staff_details").select(SETTINGS_COLUMNS).eq("profile_id", me.id).maybeSingle(),
    supabase.from("lecturer_assignments").select(ASSIGNMENT_COLUMNS).eq("lecturer_profile_id", me.id).eq("is_active", true),
    loadReference(),
  ]);
  const row = details.error ? null : parseSettingsRow(details.data);
  const rows = assignments.error ? null : parseAssignments(assignments.data);
  if (!row || !rows || !ref) return { ok: false };
  const levels = new Map(ref.levels.map((l) => [l.id, l.name]));
  const departments = new Map(ref.departments.map((d) => [d.id, d.name]));
  return {
    ok: true, title: row.title, acceptsComplaints: row.acceptsComplaints,
    departmentName: row.departmentId ? (departments.get(row.departmentId) ?? null) : null,
    scopes: rows.map((a) => describeScope(a, levels, departments)),
  };
}

export async function updateMySettings(source: { get(name: string): unknown }): Promise<ActionState> {
  const me = await requireStaff();
  const parsed = parseStaffSettings(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).from("staff_details").update(settingsUpdate(parsed.data)).eq("profile_id", me.id);
  return error ? { ok: false, message: "Your settings could not be saved. Please try again." } : { ok: true, message: "Settings saved." };
}
