// Dashboard numbers (pure). Inputs come from SECURITY INVOKER reporting functions, so RLS has
// already limited them to the complaints the signed-in user may see; this only adds them up.
import { z } from "zod";
import { COMPLAINT_STATUSES, type ComplaintStatus } from "./student-view";

const countRow = z.object({ status: z.enum(COMPLAINT_STATUSES), total: z.coerce.number().int().nonnegative() });

export type StatusTotals = {
  readonly total: number;
  /** Not yet looked at: submitted or reopened. */
  readonly new: number;
  readonly inProgress: number;
  readonly awaitingStudent: number;
  readonly resolved: number;
  readonly closed: number;
  readonly byStatus: Readonly<Record<ComplaintStatus, number>>;
};

export function parseStatusCounts(data: unknown): StatusTotals | null {
  const rows = z.array(countRow).safeParse(data);
  if (!rows.success) return null;
  const by = Object.fromEntries(COMPLAINT_STATUSES.map((s) => [s, 0])) as Record<ComplaintStatus, number>;
  for (const r of rows.data) by[r.status] += r.total;
  return {
    total: COMPLAINT_STATUSES.reduce((n, s) => n + by[s], 0),
    new: by.submitted + by.reopened,
    inProgress: by.under_review,
    awaitingStudent: by.awaiting_student,
    resolved: by.resolved,
    closed: by.closed,
    byStatus: by,
  };
}

const unreadRow = z.object({
  complaint_id: z.string().uuid(),
  unread_messages: z.coerce.number().int().nonnegative(),
  never_opened: z.boolean(),
});

export type UnreadSummary = {
  /** Complaints with at least one unread message. */
  readonly withUnreadMessages: number;
  /** Complaints this user has never opened. */
  readonly neverOpened: number;
  /** Anything that needs a look (the badge number). */
  readonly attention: number;
  readonly byComplaint: ReadonlyMap<string, { unread: number; neverOpened: boolean }>;
};

export function parseUnread(data: unknown): UnreadSummary | null {
  const rows = z.array(unreadRow).safeParse(data);
  if (!rows.success) return null;
  const byComplaint = new Map<string, { unread: number; neverOpened: boolean }>();
  for (const r of rows.data) byComplaint.set(r.complaint_id, { unread: r.unread_messages, neverOpened: r.never_opened });
  let withUnread = 0;
  let never = 0;
  for (const v of byComplaint.values()) {
    if (v.unread > 0) withUnread += 1;
    if (v.neverOpened) never += 1;
  }
  const attention = [...byComplaint.values()].filter((v) => v.unread > 0 || v.neverOpened).length;
  return { withUnreadMessages: withUnread, neverOpened: never, attention, byComplaint };
}

export const EMPTY_UNREAD: UnreadSummary = { withUnreadMessages: 0, neverOpened: 0, attention: 0, byComplaint: new Map() };

/** "9+" style badge text; null when there is nothing to show. */
export function badgeText(n: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 9 ? "9+" : String(Math.floor(n));
}
