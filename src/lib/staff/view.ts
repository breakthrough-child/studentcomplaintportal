// Lecturer / main-lecturer read models (pure). Rows come from RLS-bound SELECTs: the database has
// already decided which complaints this staff member may see. Filters here narrow what is shown;
// they never widen it, and a level or department "tab" cannot reveal anything RLS withholds.
import { z } from "zod";
import {
  COMPLAINT_STATUSES, STATUS_LABELS, searchText, type ComplaintStatus,
} from "../complaints/student-view";

export const STAFF_PAGE_SIZE = 15;
export const STAFF_VIEWS = ["all", "new", "unread", "awaiting", "triage"] as const;
export type StaffView = (typeof STAFF_VIEWS)[number];
export const VIEW_LABELS: Readonly<Record<StaffView, string>> = {
  all: "All authorised",
  new: "New",
  unread: "Unread",
  awaiting: "Awaiting student",
  triage: "Needs triage",
};

const single = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const blank = (v: unknown): unknown => {
  const x = single(v);
  return x === null || (typeof x === "string" && x.trim() === "") ? undefined : x;
};

export const STAFF_SORTS = ["activity", "newest", "oldest", "priority"] as const;
export type StaffSort = (typeof STAFF_SORTS)[number];
export const SORT_LABELS: Readonly<Record<StaffSort, string>> = {
  activity: "Latest activity", newest: "Newest first", oldest: "Oldest first", priority: "Highest priority",
};
export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

/** A real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
});

export const staffQuerySchema = z.object({
  page: z.preprocess((v) => {
    const x = blank(v);
    return typeof x === "string" && /^\d{1,4}$/.test(x) ? Number(x) : x;
  }, z.number().int().min(1).max(1000).default(1)),
  view: z.preprocess(blank, z.enum(STAFF_VIEWS).default("all")),
  status: z.preprocess(blank, z.enum(COMPLAINT_STATUSES).optional()),
  levelId: z.preprocess(blank, z.string().uuid().optional()),
  departmentId: z.preprocess(blank, z.string().uuid().optional()),
  categoryId: z.preprocess(blank, z.string().uuid().optional()),
  q: z.preprocess(blank, searchText()),
  priority: z.preprocess(blank, z.enum(PRIORITIES).optional()),
  sort: z.preprocess(blank, z.enum(STAFF_SORTS).default("activity")),
  from: z.preprocess(blank, isoDate.optional()),
  to: z.preprocess(blank, isoDate.optional()),
});
export type StaffQuery = z.infer<typeof staffQuerySchema>;

/** Invalid values fall back to the default view rather than an error page. */
export function parseStaffQuery(raw: unknown, fixed: Partial<Pick<StaffQuery, "levelId" | "departmentId" | "view">> = {}): StaffQuery {
  const parsed = staffQuerySchema.safeParse(raw ?? {});
  const base: StaffQuery = parsed.success ? parsed.data : { page: 1, view: "all", status: undefined, levelId: undefined, departmentId: undefined, categoryId: undefined, q: undefined, priority: undefined, sort: "activity", from: undefined, to: undefined };
  // A path segment (e.g. /lecturer/levels/[levelId]) overrides the query string.
  return { ...base, ...Object.fromEntries(Object.entries(fixed).filter(([, v]) => v !== undefined)) } as StaffQuery;
}

export function staffRange(page: number): { from: number; to: number } {
  const from = (page - 1) * STAFF_PAGE_SIZE;
  return { from, to: from + STAFF_PAGE_SIZE };
}

/** Link to a list page keeping the active filters (only non-default values are written). */
export function staffHref(base: string, query: StaffQuery, override: Partial<StaffQuery> = {}): string {
  const q = { ...query, ...override };
  const p = new URLSearchParams();
  if (q.view !== "all") p.set("view", q.view);
  if (q.status) p.set("status", q.status);
  if (q.levelId) p.set("levelId", q.levelId);
  if (q.departmentId) p.set("departmentId", q.departmentId);
  if (q.categoryId) p.set("categoryId", q.categoryId);
  if (q.q) p.set("q", q.q);
  if (q.priority) p.set("priority", q.priority);
  if (q.sort !== "activity") p.set("sort", q.sort);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.page > 1) p.set("page", String(q.page));
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

const ts = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "bad timestamp");
const uuid = z.string().uuid();
const PRIORITY = z.enum(["low", "normal", "high", "urgent"]);

export const STAFF_LIST_COLUMNS =
  "id,reference_number,title,status,priority,category_id,level_id,department_id,student_id,is_sensitive,requires_triage,assigned_lecturer_profile_id,created_at,last_activity_at" as const;

const listRow = z.object({
  id: uuid, reference_number: z.string().min(1), title: z.string(), status: z.enum(COMPLAINT_STATUSES), priority: PRIORITY,
  category_id: uuid, level_id: uuid, department_id: uuid, student_id: uuid, is_sensitive: z.boolean(), requires_triage: z.boolean(),
  assigned_lecturer_profile_id: uuid.nullable(), created_at: ts, last_activity_at: ts,
});

export type StaffSummary = {
  readonly id: string; readonly reference: string; readonly title: string; readonly status: ComplaintStatus;
  readonly statusLabel: string; readonly priority: "low" | "normal" | "high" | "urgent"; readonly categoryId: string;
  readonly levelId: string; readonly departmentId: string; readonly studentId: string; readonly isSensitive: boolean;
  readonly requiresTriage: boolean; readonly assignedTo: string | null; readonly createdAt: string; readonly lastActivityAt: string;
};

export function parseStaffList(data: unknown): StaffSummary[] | null {
  const r = z.array(listRow).safeParse(data);
  if (!r.success) return null;
  return r.data.map((x) => ({
    id: x.id, reference: x.reference_number, title: x.title, status: x.status, statusLabel: STATUS_LABELS[x.status],
    priority: x.priority, categoryId: x.category_id, levelId: x.level_id, departmentId: x.department_id, studentId: x.student_id,
    isSensitive: x.is_sensitive, requiresTriage: x.requires_triage, assignedTo: x.assigned_lecturer_profile_id,
    createdAt: x.created_at, lastActivityAt: x.last_activity_at,
  }));
}

/** Complaint ids the "unread" view is restricted to (uuids from the database's own read receipts). */
export function unreadIds(byComplaint: ReadonlyMap<string, { unread: number; neverOpened: boolean }>): string[] {
  return [...byComplaint.entries()].filter(([, v]) => v.unread > 0 || v.neverOpened).map(([id]) => id);
}

const nameRow = z.object({ id: uuid, name: z.string() });
export function parseNameMap(data: unknown): Map<string, string> | null {
  const r = z.array(nameRow).safeParse(data);
  return r.success ? new Map(r.data.map((x) => [x.id, x.name])) : null;
}

export const STAFF_DETAIL_COLUMNS = `${STAFF_LIST_COLUMNS},description,resolved_at,closed_at,target_lecturer_profile_id` as const;
const detailRow = listRow.extend({
  description: z.string(), resolved_at: ts.nullable(), closed_at: ts.nullable(), target_lecturer_profile_id: uuid,
});
export type StaffDetail = StaffSummary & {
  readonly description: string; readonly resolvedAt: string | null; readonly closedAt: string | null; readonly targetLecturerId: string;
};
export function parseStaffDetail(data: unknown): StaffDetail | null {
  const r = detailRow.safeParse(data);
  if (!r.success) return null;
  const [s] = parseStaffList([r.data]) ?? [];
  return s ? { ...s, description: r.data.description, resolvedAt: r.data.resolved_at, closedAt: r.data.closed_at, targetLecturerId: r.data.target_lecturer_profile_id } : null;
}

// ---- conversation, attachments, timeline ------------------------------------------------
export const MESSAGE_COLUMNS = "id,author_profile_id,body,created_at" as const;
const msgRow = z.object({ id: uuid, author_profile_id: uuid, body: z.string(), created_at: ts });

export const ATTACHMENT_COLUMNS = "id,message_id,uploaded_by_profile_id,original_filename,mime_type,file_size,created_at" as const;
const attRow = z.object({
  id: uuid, message_id: uuid.nullable(), uploaded_by_profile_id: uuid, original_filename: z.string(), mime_type: z.string(),
  file_size: z.coerce.number().int().positive(), created_at: ts,
});
export type AttachmentView = {
  readonly id: string; readonly messageId: string | null; readonly uploadedByYou: boolean; readonly filename: string;
  readonly mimeType: string; readonly sizeLabel: string;
};

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseAttachments(data: unknown, viewerId: string): AttachmentView[] | null {
  const r = z.array(attRow).safeParse(data);
  if (!r.success) return null;
  return [...r.data]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
    .map((a) => ({
      id: a.id, messageId: a.message_id, uploadedByYou: a.uploaded_by_profile_id === viewerId, filename: a.original_filename,
      mimeType: a.mime_type, sizeLabel: formatBytes(a.file_size),
    }));
}

export type ConversationMessage = {
  readonly id: string; readonly fromYou: boolean; readonly author: string; readonly body: string; readonly createdAt: string;
  readonly attachments: readonly AttachmentView[];
};

/** Author names come from profiles the viewer is allowed to read; otherwise "Staff"/"Student". */
export function buildConversation(
  messages: unknown, names: ReadonlyMap<string, string>, viewerId: string, studentProfileId: string | null,
  attachments: readonly AttachmentView[],
): ConversationMessage[] | null {
  const r = z.array(msgRow).safeParse(messages);
  if (!r.success) return null;
  return [...r.data]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
    .map((m) => ({
      id: m.id, fromYou: m.author_profile_id === viewerId,
      author: m.author_profile_id === viewerId ? "You" : (names.get(m.author_profile_id) ?? (m.author_profile_id === studentProfileId ? "Student" : "Staff")),
      body: m.body, createdAt: m.created_at, attachments: attachments.filter((a) => a.messageId === m.id),
    }));
}

export const HISTORY_COLUMNS = "id,actor_profile_id,old_status,new_status,reason,created_at" as const;
export const EVENT_COLUMNS = "id,actor_profile_id,event_type,metadata,created_at" as const;
const historyRow = z.object({ id: uuid, actor_profile_id: uuid.nullable(), old_status: z.enum(COMPLAINT_STATUSES).nullable(), new_status: z.enum(COMPLAINT_STATUSES), reason: z.string().nullable(), created_at: ts });
const eventRow = z.object({ id: uuid, actor_profile_id: uuid.nullable(), event_type: z.string(), metadata: z.record(z.unknown()).default({}), created_at: ts });

export type TimelineEntry = { readonly id: string; readonly at: string; readonly text: string };

const EVENT_TEXT: Readonly<Record<string, string>> = {
  assigned: "Complaint assigned",
  escalated: "Escalated for triage",
  access_revoked: "A lecturer's access was removed",
  first_reviewed: "First reviewed",
  attachment_added: "A file was attached",
  attachment_removed: "A file was removed",
};

/** Status changes (with reasons) and key events, oldest first. Messages live in the conversation. */
export function buildTimeline(history: unknown, events: unknown, names: ReadonlyMap<string, string>): TimelineEntry[] | null {
  const h = z.array(historyRow).safeParse(history);
  const e = z.array(eventRow).safeParse(events);
  if (!h.success || !e.success) return null;
  const who = (id: string | null) => (id ? (names.get(id) ?? "Someone") : "System");
  const out: TimelineEntry[] = [];
  for (const x of h.data) {
    const to = STATUS_LABELS[x.new_status];
    const text = x.old_status === null
      ? `Submitted`
      : `${who(x.actor_profile_id)} changed the status from ${STATUS_LABELS[x.old_status]} to ${to}${x.reason ? `: ${x.reason}` : ""}`;
    out.push({ id: `h-${x.id}`, at: x.created_at, text });
  }
  for (const x of e.data) {
    const label = EVENT_TEXT[x.event_type];
    if (!label) continue; // submitted, status_changed and message_posted are shown elsewhere
    out.push({ id: `e-${x.id}`, at: x.created_at, text: x.event_type === "attachment_added" || x.event_type === "attachment_removed" ? `${who(x.actor_profile_id)}: ${label.toLowerCase()}` : label });
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
}

export const ACCESS_COLUMNS = "profile_id,reason,is_active" as const;
const accessRow = z.object({ profile_id: uuid, reason: z.enum(["target", "assigned", "delegated"]), is_active: z.boolean() });
export type AccessGrant = { readonly profileId: string; readonly reason: "target" | "assigned" | "delegated" };
export function parseAccessGrants(data: unknown): AccessGrant[] | null {
  const r = z.array(accessRow).safeParse(data);
  return r.success ? r.data.filter((a) => a.is_active).map((a) => ({ profileId: a.profile_id, reason: a.reason })) : null;
}

// ---- reports -----------------------------------------------------------------------------
const scopeRow = z.object({ level_id: uuid, department_id: uuid, status: z.enum(COMPLAINT_STATUSES), total: z.coerce.number().int().nonnegative() });
export type ScopeRow = { levelId: string; departmentId: string; status: ComplaintStatus; total: number };
export function parseScopeCounts(data: unknown): ScopeRow[] | null {
  const r = z.array(scopeRow).safeParse(data);
  return r.success ? r.data.map((x) => ({ levelId: x.level_id, departmentId: x.department_id, status: x.status, total: x.total })) : null;
}

export type Rollup = { readonly id: string; readonly total: number; readonly open: number; readonly resolved: number };
const OPEN: readonly ComplaintStatus[] = ["submitted", "under_review", "awaiting_student", "reopened"];
/** Totals per level or per department; "open" excludes resolved and closed. */
export function rollup(rows: readonly ScopeRow[], by: "levelId" | "departmentId"): Rollup[] {
  const m = new Map<string, { total: number; open: number; resolved: number }>();
  for (const r of rows) {
    const cur = m.get(r[by]) ?? { total: 0, open: 0, resolved: 0 };
    cur.total += r.total;
    if (OPEN.includes(r.status)) cur.open += r.total;
    if (r.status === "resolved" || r.status === "closed") cur.resolved += r.total;
    m.set(r[by], cur);
  }
  return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
}

const trendRow = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), submitted: z.coerce.number().int().nonnegative(), resolved: z.coerce.number().int().nonnegative() });
export type TrendDay = { day: string; submitted: number; resolved: number };
export function parseTrend(data: unknown): TrendDay[] | null {
  const r = z.array(trendRow).safeParse(data);
  return r.success ? r.data : null;
}

const overdueRow = z.object({
  complaint_id: uuid, reference_number: z.string(), status: z.enum(COMPLAINT_STATUSES), priority: PRIORITY, created_at: ts,
  last_activity_at: ts, days_inactive: z.coerce.number().int().nonnegative(),
});
export type OverdueItem = { id: string; reference: string; status: ComplaintStatus; statusLabel: string; priority: string; daysInactive: number };
export function parseOverdue(data: unknown): OverdueItem[] | null {
  const r = z.array(overdueRow).safeParse(data);
  return r.success
    ? r.data.map((x) => ({ id: x.complaint_id, reference: x.reference_number, status: x.status, statusLabel: STATUS_LABELS[x.status], priority: x.priority, daysInactive: x.days_inactive }))
    : null;
}

// ---- assignable lecturers (main lecturers) ---------------------------------------------
const assignable = z.object({ profile_id: uuid, full_name: z.string().min(1), title: z.string().nullable(), department_name: z.string().nullable(), scope_labels: z.array(z.string()).default([]) });
export type AssignableLecturer = { id: string; name: string; title: string | null; department: string | null; scopes: string[] };
export function parseAssignable(data: unknown): AssignableLecturer[] | null {
  const r = z.array(assignable).safeParse(data);
  return r.success ? r.data.map((x) => ({ id: x.profile_id, name: x.full_name, title: x.title?.trim() || null, department: x.department_name?.trim() || null, scopes: x.scope_labels })) : null;
}

/** Half-open created_at bounds for the date filter: [from 00:00 UTC, day after "to" 00:00 UTC). */
export function dateBounds(q: Pick<StaffQuery, "from" | "to">): { gte?: string; lt?: string } {
  const out: { gte?: string; lt?: string } = {};
  if (q.from) out.gte = `${q.from}T00:00:00.000Z`;
  if (q.to) out.lt = new Date(Date.parse(`${q.to}T00:00:00.000Z`) + 86_400_000).toISOString();
  return out;
}
