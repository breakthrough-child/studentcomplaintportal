// Administrator form validation and database argument builders (pure).
// Authorization is NOT decided here: the admin pages call requireRole(["admin"]) and every table
// write below is also gated by RLS (is_admin()) and guard triggers. These schemas only check shape.
import { z } from "zod";
import { codePointLength, containsForbiddenText, requiredUuid } from "../complaints/schema";

export type Src = { get(name: string): unknown };

function pick(source: Src, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = source.get(f);
    out[f] = v === null ? undefined : v;
  }
  return out;
}

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Single-line text, collapsed whitespace, bounded in code points, no control/bidi characters. */
function line(label: string, max: number, min = 1) {
  return z
    .string({ required_error: `Enter ${label}`, invalid_type_error: `Enter ${label}` })
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .superRefine((s, ctx) => {
      const n = codePointLength(s);
      if (n < min) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Enter ${label}` });
      else if (n > max) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label[0]?.toUpperCase()}${label.slice(1)} must be at most ${max} characters` });
      if (containsForbiddenText(s, false)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label[0]?.toUpperCase()}${label.slice(1)} contains characters that are not allowed` });
    });
}

/** Optional single-line text: blank becomes null. */
function optionalLine(label: string, max: number) {
  return z.preprocess(
    (v) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v),
    line(label, max).optional(),
  ).transform((v) => v ?? null);
}

const optionalUuidField = (message: string) =>
  z.preprocess((v) => (v === null || (typeof v === "string" && v.trim() === "") ? undefined : v), z.string({ invalid_type_error: message }).trim().uuid(message).optional()).transform((v) => v ?? null);

// ---- departments ------------------------------------------------------------------------
export const departmentSchema = z
  .object({
    id: optionalUuidField("Invalid department"),
    name: line("a department name", 120),
    code: optionalLine("a code", 20),
    description: optionalLine("a description", 1000),
    isActive: checkbox,
  })
  .strict();
export const parseDepartment = (s: Src) => departmentSchema.safeParse(pick(s, ["id", "name", "code", "description", "isActive"]));
export const departmentRow = (i: z.infer<typeof departmentSchema>) => ({ name: i.name, code: i.code, description: i.description, is_active: i.isActive }) as const;

// ---- academic levels --------------------------------------------------------------------
export const levelSchema = z
  .object({
    id: optionalUuidField("Invalid level"),
    name: line("a level name", 60),
    levelNumber: z.preprocess(
      (v) => (typeof v === "string" && /^\d{1,5}$/.test(v.trim()) ? Number(v.trim()) : v),
      z.number({ required_error: "Enter the level number", invalid_type_error: "Enter the level number, for example 300" }).int("Enter a whole number").min(1, "The level number must be positive").max(9999, "That level number is too large"),
    ),
    isActive: checkbox,
  })
  .strict();
export const parseLevel = (s: Src) => levelSchema.safeParse(pick(s, ["id", "name", "levelNumber", "isActive"]));
export const levelRow = (i: z.infer<typeof levelSchema>) => ({ name: i.name, level_number: i.levelNumber, is_active: i.isActive }) as const;

// ---- complaint categories ---------------------------------------------------------------
export const categorySchema = z
  .object({
    id: optionalUuidField("Invalid category"),
    name: line("a category name", 120),
    description: optionalLine("a description", 1000),
    isSensitive: checkbox,
    isActive: checkbox,
  })
  .strict();
export const parseCategory = (s: Src) => categorySchema.safeParse(pick(s, ["id", "name", "description", "isSensitive", "isActive"]));
export const categoryRow = (i: z.infer<typeof categorySchema>) => ({ name: i.name, description: i.description, is_sensitive: i.isSensitive, is_active: i.isActive }) as const;

// ---- students ---------------------------------------------------------------------------
export const REGISTRATION_PATTERN = /^[A-Z0-9][A-Z0-9/._-]{1,39}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const APPROVALS = ["pending", "approved", "rejected", "suspended"] as const;

const email = z
  .string({ required_error: "Enter an email address", invalid_type_error: "Enter an email address" })
  .transform((s) => s.trim().toLowerCase())
  .refine((s) => s.length >= 3 && s.length <= 320 && EMAIL.test(s) && !containsForbiddenText(s, false), "Enter a valid email address");

const registration = z
  .string({ required_error: "Enter a registration number", invalid_type_error: "Enter a registration number" })
  .transform((s) => s.trim().toUpperCase())
  .refine((s) => REGISTRATION_PATTERN.test(s), "Use letters, numbers and / . _ - (2 to 40 characters)");

export const studentCreateSchema = z
  .object({
    schoolEmail: email,
    fullName: line("the student's full name", 200),
    registrationNumber: registration,
    levelId: requiredUuid("Choose a level"),
    departmentId: requiredUuid("Choose a department"),
    approvalStatus: z.enum(APPROVALS, { errorMap: () => ({ message: "Choose a status" }) }),
  })
  .strict();
export const parseStudentCreate = (s: Src) => studentCreateSchema.safeParse(pick(s, ["schoolEmail", "fullName", "registrationNumber", "levelId", "departmentId", "approvalStatus"]));
export const studentInsertRow = (i: z.infer<typeof studentCreateSchema>) =>
  ({ school_email: i.schoolEmail, full_name: i.fullName, registration_number: i.registrationNumber, level_id: i.levelId, department_id: i.departmentId, approval_status: i.approvalStatus }) as const;

// Self-registered students have no level / department yet, so both may be left unset, except for
// approval (the database enforces the same rule with students_approved_has_scope).
export const studentUpdateSchema = z
  .object({
    id: requiredUuid("Invalid student"),
    levelId: optionalUuidField("Choose a valid level"),
    departmentId: optionalUuidField("Choose a valid department"),
    approvalStatus: z.enum(APPROVALS, { errorMap: () => ({ message: "Choose a status" }) }),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.approvalStatus !== "approved") return;
    if (!v.levelId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["levelId"], message: "Choose a level before approving" });
    if (!v.departmentId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["departmentId"], message: "Choose a department before approving" });
  });
export const parseStudentUpdate = (s: Src) => studentUpdateSchema.safeParse(pick(s, ["id", "levelId", "departmentId", "approvalStatus"]));
/** An unset level / department is left as it is, never cleared. */
export const studentUpdateRow = (i: z.infer<typeof studentUpdateSchema>) => ({
  approval_status: i.approvalStatus,
  ...(i.levelId ? { level_id: i.levelId } : {}),
  ...(i.departmentId ? { department_id: i.departmentId } : {}),
});

export const inviteStudentSchema = z.object({ id: requiredUuid("Invalid student") }).strict();
export const parseInviteStudent = (s: Src) => inviteStudentSchema.safeParse(pick(s, ["id"]));

// ---- staff invitations ------------------------------------------------------------------
export const STAFF_ROLES = ["lecturer", "main_lecturer", "admin"] as const;
export const staffInviteSchema = z
  .object({
    email,
    fullName: line("the person's full name", 200),
    role: z.enum(STAFF_ROLES, { errorMap: () => ({ message: "Choose a role" }) }),
    departmentId: optionalUuidField("Choose a valid department"),
    title: optionalLine("a title", 100),
    confirmAdmin: checkbox,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.role === "admin" && !v.confirmAdmin) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmAdmin"], message: "Confirm that this person should become an administrator" });
    }
  });
export const parseStaffInvite = (s: Src) => staffInviteSchema.safeParse(pick(s, ["email", "fullName", "role", "departmentId", "title", "confirmAdmin"]));
export const invitationRow = (i: z.infer<typeof staffInviteSchema>) =>
  ({ email: i.email, full_name: i.fullName, role: i.role, department_id: i.role === "admin" ? null : i.departmentId, title: i.role === "admin" ? null : i.title }) as const;

export const resendInviteSchema = z.object({ email }).strict();
export const parseResendInvite = (s: Src) => resendInviteSchema.safeParse(pick(s, ["email"]));

// ---- lecturer details (admin edit) ------------------------------------------------------
export const staffDetailsSchema = z
  .object({
    profileId: requiredUuid("Invalid lecturer"),
    departmentId: optionalUuidField("Choose a valid department"),
    title: optionalLine("a title", 100),
    acceptsComplaints: checkbox,
  })
  .strict();
export const parseStaffDetails = (s: Src) => staffDetailsSchema.safeParse(pick(s, ["profileId", "departmentId", "title", "acceptsComplaints"]));
/** Only these three columns; approval goes through review_registration, role/activation through Users. */
export const staffDetailsRow = (i: z.infer<typeof staffDetailsSchema>) =>
  ({ department_id: i.departmentId, title: i.title, accepts_complaints: i.acceptsComplaints }) as const;

// ---- users ------------------------------------------------------------------------------
export const CHANGEABLE_ROLES = ["lecturer", "main_lecturer"] as const;
export const userUpdateSchema = z
  .object({
    id: requiredUuid("Invalid user"),
    isActive: checkbox,
    role: z.preprocess((v) => (v === null || v === "" ? undefined : v), z.enum(CHANGEABLE_ROLES, { errorMap: () => ({ message: "Choose a valid role" }) }).optional()),
  })
  .strict();
export const parseUserUpdate = (s: Src) => userUpdateSchema.safeParse(pick(s, ["id", "isActive", "role"]));
/** Only the fields that were actually provided are written. */
export const userUpdateRow = (i: z.infer<typeof userUpdateSchema>) => (i.role ? { is_active: i.isActive, role: i.role } : { is_active: i.isActive });

// ---- lecturer assignments ---------------------------------------------------------------
export const ASSIGNMENT_SCOPES = ["institution", "level", "department", "department_level"] as const;
export const assignmentSchema = z
  .object({
    lecturerId: requiredUuid("Choose a lecturer"),
    scopeType: z.enum(ASSIGNMENT_SCOPES, { errorMap: () => ({ message: "Choose a scope" }) }),
    levelId: optionalUuidField("Choose a valid level"),
    departmentId: optionalUuidField("Choose a valid department"),
  })
  .strict()
  .superRefine((v, ctx) => {
    // Same shape rule as the lecturer_assignments CHECK constraint.
    const needLevel = v.scopeType === "level" || v.scopeType === "department_level";
    const needDept = v.scopeType === "department" || v.scopeType === "department_level";
    if (needLevel && !v.levelId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["levelId"], message: "Choose a level" });
    if (needDept && !v.departmentId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["departmentId"], message: "Choose a department" });
  });
export const parseAssignment = (s: Src) => assignmentSchema.safeParse(pick(s, ["lecturerId", "scopeType", "levelId", "departmentId"]));
/** Fields a scope does not use are dropped, so "institution" can never carry a level by accident. */
export const assignmentRow = (i: z.infer<typeof assignmentSchema>) => ({
  lecturer_profile_id: i.lecturerId,
  scope_type: i.scopeType,
  level_id: i.scopeType === "level" || i.scopeType === "department_level" ? i.levelId : null,
  department_id: i.scopeType === "department" || i.scopeType === "department_level" ? i.departmentId : null,
}) as const;

export const assignmentToggleSchema = z.object({ id: requiredUuid("Invalid assignment"), isActive: checkbox }).strict();
export const parseAssignmentToggle = (s: Src) => assignmentToggleSchema.safeParse(pick(s, ["id", "isActive"]));
export const assignmentDeleteSchema = z.object({ id: requiredUuid("Invalid assignment"), confirm: checkbox.refine((v) => v, "Tick the box to confirm") }).strict();
export const parseAssignmentDelete = (s: Src) => assignmentDeleteSchema.safeParse(pick(s, ["id", "confirm"]));

// ---- registration review (self-registered students and lecturers) ----------------------
export const REVIEW_DECISIONS = ["approved", "rejected"] as const;
export const reviewSchema = z
  .object({
    profileId: requiredUuid("Invalid account"),
    decision: z.enum(REVIEW_DECISIONS, { errorMap: () => ({ message: "Choose approve or reject" }) }),
    levelId: optionalUuidField("Choose a valid level"),
    departmentId: optionalUuidField("Choose a valid department"),
  })
  .strict();
export const parseReview = (s: Src) => reviewSchema.safeParse(pick(s, ["profileId", "decision", "levelId", "departmentId"]));
/** Arguments for review_registration(); the database re-checks everything (admin, scope for students). */
export const reviewArgs = (i: z.infer<typeof reviewSchema>) =>
  ({ p_profile_id: i.profileId, p_decision: i.decision, p_level_id: i.levelId, p_department_id: i.departmentId }) as const;

// ---- level advisors -------------------------------------------------------------------
export const advisorSchema = z
  .object({ departmentId: requiredUuid("Choose a department"), levelId: requiredUuid("Choose a level"), lecturerId: requiredUuid("Choose a lecturer") })
  .strict();
export const parseAdvisor = (s: Src) => advisorSchema.safeParse(pick(s, ["departmentId", "levelId", "lecturerId"]));
export const advisorRemoveSchema = z.object({ departmentId: requiredUuid("Invalid department"), levelId: requiredUuid("Invalid level") }).strict();
export const parseAdvisorRemove = (s: Src) => advisorRemoveSchema.safeParse(pick(s, ["departmentId", "levelId"]));

export type AdminState = {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
};
export const initialAdminState: AdminState = { ok: false };
