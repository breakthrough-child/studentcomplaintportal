// Staff (lecturer / main lecturer) mutations (pure validation and argument building). Every
// mutation is a database function that re-checks the caller's role and complaint access
// (can_manage_complaint, is_main_lecturer); nothing here is an authorization decision.
import { z } from "zod";
import { containsForbiddenText, codePointLength, requiredUuid } from "../complaints/schema";
import type { ComplaintStatus } from "../complaints/student-view";

/**
 * Mirror of public.is_valid_status_transition (tests/unit/staff-actions.test.ts compares this table
 * with the migration text). It is used only to offer sensible buttons; the database is the gate.
 * 'reopened' is a student action and is excluded from staff choices.
 */
export const TRANSITIONS: Readonly<Record<ComplaintStatus, readonly ComplaintStatus[]>> = {
  submitted: ["under_review", "awaiting_student", "closed"],
  under_review: ["awaiting_student", "resolved", "closed"],
  awaiting_student: ["under_review", "resolved", "closed"],
  resolved: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["under_review", "awaiting_student", "resolved", "closed"],
};

export function allowedStaffTransitions(from: ComplaintStatus): ComplaintStatus[] {
  return TRANSITIONS[from].filter((s) => s !== "reopened");
}

export const STAFF_STATUS_ACTIONS: Readonly<Partial<Record<ComplaintStatus, string>>> = {
  under_review: "Mark under review",
  awaiting_student: "Ask the student to respond",
  resolved: "Mark resolved",
  closed: "Close complaint",
};

const REASON_MAX = 1000;
const reason = (required: boolean, message: string) =>
  z
    .preprocess(
      (v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v),
      z
        .string({ invalid_type_error: message })
        .transform((s) => s.replace(/\r\n?/g, "\n").trim())
        .refine((s) => codePointLength(s) <= REASON_MAX, `The reason must be at most ${REASON_MAX} characters`)
        .refine((s) => !containsForbiddenText(s, true), "The reason contains characters that are not allowed")
        .optional(),
    )
    .refine((v) => !required || v !== undefined, message);

export const STATUSES_FOR_STAFF = ["under_review", "awaiting_student", "resolved", "closed"] as const;

export const statusChangeSchema = z
  .object({
    complaintId: requiredUuid("Invalid complaint"),
    newStatus: z.enum(STATUSES_FOR_STAFF, { errorMap: () => ({ message: "Choose a valid status" }) }),
    reason: reason(false, "Enter a reason"),
  })
  .strict();

export const escalateSchema = z
  .object({
    complaintId: requiredUuid("Invalid complaint"),
    reason: reason(true, "Enter a reason for escalating"),
    restrict: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .strict();

export const assignSchema = z
  .object({ complaintId: requiredUuid("Invalid complaint"), lecturerId: requiredUuid("Choose a lecturer") })
  .strict();

export const revokeSchema = z
  .object({ complaintId: requiredUuid("Invalid complaint"), profileId: requiredUuid("Invalid person") })
  .strict();

export const reopenSchema = z
  .object({ complaintId: requiredUuid("Invalid complaint"), reason: reason(true, "Explain why you want to reopen this complaint") })
  .strict();

export const readSchema = z.object({ complaintId: requiredUuid("Invalid complaint") }).strict();

type Src = { get(name: string): unknown };
function pick(source: Src, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = source.get(f);
    out[f] = v === null ? undefined : v;
  }
  return out;
}

export const parseStatusChange = (s: Src) => statusChangeSchema.safeParse(pick(s, ["complaintId", "newStatus", "reason"]));
export const parseEscalate = (s: Src) => escalateSchema.safeParse(pick(s, ["complaintId", "reason", "restrict"]));
export const parseAssign = (s: Src) => assignSchema.safeParse(pick(s, ["complaintId", "lecturerId"]));
export const parseRevoke = (s: Src) => revokeSchema.safeParse(pick(s, ["complaintId", "profileId"]));
export const parseReopen = (s: Src) => reopenSchema.safeParse(pick(s, ["complaintId", "reason"]));

// Exact parameter names of the database functions (checked against the migrations in tests).
export const statusArgs = (i: z.infer<typeof statusChangeSchema>) =>
  ({ p_complaint_id: i.complaintId, p_new_status: i.newStatus, p_reason: i.reason ?? null }) as const;
export const reopenArgs = (i: z.infer<typeof reopenSchema>) =>
  ({ p_complaint_id: i.complaintId, p_new_status: "reopened", p_reason: i.reason ?? null }) as const;
export const escalateArgs = (i: z.infer<typeof escalateSchema>) =>
  ({ p_complaint_id: i.complaintId, p_reason: i.reason ?? "", p_restrict: i.restrict }) as const;
export const assignArgs = (i: z.infer<typeof assignSchema>) =>
  ({ p_complaint_id: i.complaintId, p_lecturer_profile_id: i.lecturerId }) as const;
export const revokeArgs = (i: z.infer<typeof revokeSchema>) =>
  ({ p_complaint_id: i.complaintId, p_profile_id: i.profileId }) as const;

export type ActionState = {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
};
export const initialActionState: ActionState = { ok: false };
