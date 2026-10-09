// Student complaint list/detail logic (pure). Authorization is NOT decided here: rows come from
// RLS-bound SELECTs (a student can read only their own complaints). This module validates the
// query string, validates and minimises what the database returned, and shapes it for display.
import { z } from "zod";

export const STUDENT_PAGE_SIZE = 10;
export const STUDENT_MAX_PAGE = 1000;

export const COMPLAINT_STATUSES = ["submitted", "under_review", "awaiting_student", "resolved", "closed", "reopened"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const STATUS_LABELS: Readonly<Record<ComplaintStatus, string>> = {
  submitted: "Submitted",
  under_review: "Under review",
  awaiting_student: "Waiting for your reply",
  resolved: "Resolved",
  closed: "Closed",
  reopened: "Reopened",
};

const single = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const blankToUndefined = (v: unknown): unknown => {
  const x = single(v);
  return x === null || (typeof x === "string" && x.trim() === "") ? undefined : x;
};

/** Query-string input for the list page. Unknown keys are ignored (Next adds none, users may). */
export const listQuerySchema = z.object({
  page: z.preprocess(
    (v) => {
      const x = blankToUndefined(v);
      return typeof x === "string" && /^\d{1,4}$/.test(x) ? Number(x) : x;
    },
    z.number().int().min(1).max(STUDENT_MAX_PAGE).default(1),
  ),
  status: z.preprocess(blankToUndefined, z.enum(COMPLAINT_STATUSES).optional()),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Bad query strings fall back to defaults instead of erroring: the list is the safe default view. */
export function parseListQuery(raw: unknown): ListQuery {
  const parsed = listQuerySchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : { page: 1, status: undefined };
}

export function listRange(page: number): { from: number; to: number } {
  const from = (page - 1) * STUDENT_PAGE_SIZE;
  // one extra row tells us whether a next page exists
  return { from, to: from + STUDENT_PAGE_SIZE };
}

export const complaintIdSchema = z.string().uuid();

const timestamp = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "bad timestamp");

export const LIST_COLUMNS = "id,reference_number,title,status,priority,created_at,last_activity_at" as const;
const listRowSchema = z.object({
  id: z.string().uuid(),
  reference_number: z.string().min(1),
  title: z.string(),
  status: z.enum(COMPLAINT_STATUSES),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  created_at: timestamp,
  last_activity_at: timestamp,
});

export type ComplaintSummary = {
  readonly id: string;
  readonly reference: string;
  readonly title: string;
  readonly status: ComplaintStatus;
  readonly statusLabel: string;
  readonly priority: "low" | "normal" | "high" | "urgent";
  readonly createdAt: string;
  readonly lastActivityAt: string;
};

function summarise(r: z.infer<typeof listRowSchema>): ComplaintSummary {
  return {
    id: r.id, reference: r.reference_number, title: r.title, status: r.status, statusLabel: STATUS_LABELS[r.status],
    priority: r.priority, createdAt: r.created_at, lastActivityAt: r.last_activity_at,
  };
}

export function parseComplaintList(data: unknown): ComplaintSummary[] | null {
  const r = z.array(listRowSchema).safeParse(data);
  return r.success ? r.data.map(summarise) : null;
}

export const DETAIL_COLUMNS = `${LIST_COLUMNS},description,is_sensitive,resolved_at,closed_at,category_id,target_lecturer_profile_id` as const;
const detailRowSchema = listRowSchema.extend({
  description: z.string(),
  is_sensitive: z.boolean(),
  resolved_at: timestamp.nullable(),
  closed_at: timestamp.nullable(),
  category_id: z.string().uuid(),
  target_lecturer_profile_id: z.string().uuid(),
});

export type ComplaintDetail = ComplaintSummary & {
  readonly description: string;
  readonly isSensitive: boolean;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly categoryId: string;
  readonly targetLecturerId: string;
};

export function parseComplaintDetail(data: unknown): ComplaintDetail | null {
  const r = detailRowSchema.safeParse(data);
  return r.success
    ? {
        ...summarise(r.data), description: r.data.description, isSensitive: r.data.is_sensitive,
        resolvedAt: r.data.resolved_at, closedAt: r.data.closed_at, categoryId: r.data.category_id,
        targetLecturerId: r.data.target_lecturer_profile_id,
      }
    : null;
}

export const MESSAGE_COLUMNS = "id,author_profile_id,body,created_at" as const;
const messageRowSchema = z.object({
  id: z.string().uuid(), author_profile_id: z.string().uuid(), body: z.string(), created_at: timestamp,
});

/** Staff identities are not sent to the browser: only "you" or "staff". */
export type ThreadMessage = { readonly id: string; readonly fromYou: boolean; readonly body: string; readonly createdAt: string };

export function parseThread(data: unknown, viewerProfileId: string): ThreadMessage[] | null {
  const r = z.array(messageRowSchema).safeParse(data);
  if (!r.success) return null;
  return [...r.data]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id))
    .map((m) => ({ id: m.id, fromYou: m.author_profile_id === viewerProfileId, body: m.body, createdAt: m.created_at }));
}

/** Result states the UI must handle. Unauthorized and missing are deliberately indistinguishable. */
export type ListResult =
  | { readonly state: "ok"; readonly items: readonly ComplaintSummary[]; readonly page: number; readonly hasMore: boolean }
  | { readonly state: "empty"; readonly filtered: boolean }
  | { readonly state: "error"; readonly message: string };

export type DetailResult =
  | {
      readonly state: "ok";
      readonly complaint: ComplaintDetail;
      readonly thread: readonly ThreadMessage[];
      /** Display names only; null when the database does not let this student read them. */
      readonly recipientName: string | null;
      readonly categoryName: string | null;
    }
  | { readonly state: "not_found" }
  | { readonly state: "error"; readonly message: string };

export function shapeList(rows: readonly ComplaintSummary[], query: ListQuery): ListResult {
  if (rows.length === 0) return { state: "empty", filtered: query.status !== undefined || query.page > 1 };
  return {
    state: "ok",
    items: rows.slice(0, STUDENT_PAGE_SIZE),
    page: query.page,
    hasMore: rows.length > STUDENT_PAGE_SIZE,
  };
}

/** One name column from a single-row lookup (profiles.full_name / complaint_categories.name). */
export function parseName(data: unknown): string | null {
  const r = z.object({ name: z.string().min(1) }).safeParse(data);
  return r.success ? r.data.name : null;
}

export const GENERIC_ERROR = "Your complaints could not be loaded. Please try again in a moment.";
