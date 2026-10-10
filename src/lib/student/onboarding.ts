// Student onboarding state (pure). The database decides access (is_approved_student()); this
// only turns the student's own record into a message and the right next step for the UI.
import { z } from "zod";

export const APPROVAL_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const STUDENT_COLUMNS = "id,full_name,school_email,registration_number,level_id,department_id,approval_status" as const;

export const studentRecordSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  school_email: z.string(),
  // Optional at self-registration; level and department are set by an administrator on approval.
  registration_number: z.string().nullable(),
  level_id: z.string().uuid().nullable(),
  department_id: z.string().uuid().nullable(),
  approval_status: z.enum(APPROVAL_STATUSES),
});
export type StudentRecord = z.infer<typeof studentRecordSchema>;

export function parseStudentRecord(row: unknown): StudentRecord | null {
  const r = studentRecordSchema.safeParse(row);
  return r.success ? r.data : null;
}

export type StudentAccess =
  | { readonly state: "unlinked"; readonly canComplain: false; readonly message: string }
  | { readonly state: ApprovalStatus; readonly canComplain: boolean; readonly message: string };

const MESSAGES: Readonly<Record<ApprovalStatus, string>> = {
  pending: "Your account is waiting for administrator approval. You can submit complaints once it is approved.",
  approved: "Your registration is approved.",
  rejected: "Your registration was not approved. Please contact the university administrator.",
  suspended: "Your student access is suspended. Please contact the university administrator.",
};

/**
 * `record` is what the student's own session can read: RLS shows a student only the record
 * linked to their account, so null means "no record is linked to this account yet".
 * `canComplain` is a display hint; submit_complaint re-checks is_approved_student().
 */
/** Shown with a pending/approved state when the student has not yet confirmed their e-mail address. */
export const EMAIL_UNVERIFIED =
  "Your email address is not confirmed yet. Use the link we sent you; complaints can only be submitted from a confirmed address.";

export function studentAccess(record: StudentRecord | null): StudentAccess {
  if (record === null) {
    return {
      state: "unlinked",
      canComplain: false,
      message: "Your account is not linked to a student record yet. Enter your registration number to link it.",
    };
  }
  return { state: record.approval_status, canComplain: record.approval_status === "approved", message: MESSAGES[record.approval_status] };
}

// Same shape the database enforces on students.registration_number (after upper-casing).
export const REGISTRATION_PATTERN = /^[A-Z0-9][A-Z0-9/._-]{1,39}$/;

export const claimSchema = z
  .object({
    registrationNumber: z
      .string({ required_error: "Enter your registration number", invalid_type_error: "Enter your registration number" })
      .transform((s) => s.trim().toUpperCase())
      .refine((s) => s.length > 0, "Enter your registration number")
      .refine((s) => s.length === 0 || REGISTRATION_PATTERN.test(s), "That is not a valid registration number"),
  })
  .strict();

/** One message for every failure, so the form cannot be used to probe other students' numbers. */
export const CLAIM_FAILED = "We could not link that registration number to your account. Check it and try again, or contact the administrator.";
export const CLAIM_LOCKED = "Too many unsuccessful attempts. Please wait an hour or contact the administrator.";
export const CLAIM_OK = "Your account is now linked to your student record.";

export function claimOutcome(data: unknown, error: unknown): { ok: boolean; message: string } {
  if (error) return { ok: false, message: CLAIM_FAILED };
  return data === true ? { ok: true, message: CLAIM_OK } : { ok: false, message: CLAIM_FAILED };
}
