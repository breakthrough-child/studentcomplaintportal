// Lecturer self-service settings and assignment labels (pure).
// A lecturer may change only their own title and whether they accept complaints; the database
// (staff_details_update_self + guard trigger) refuses everything else, including their department.
import { z } from "zod";
import { codePointLength, containsForbiddenText } from "../complaints/schema";

export const TITLE_MAX = 100;
export const SETTINGS_COLUMNS = "title,accepts_complaints,department_id,email_notifications" as const;

export const staffSettingsSchema = z
  .object({
    title: z.preprocess(
      (v) => (v === null ? undefined : v),
      z
        .string({ invalid_type_error: "Enter a valid title" })
        .transform((s) => s.replace(/\s+/g, " ").trim())
        .refine((s) => codePointLength(s) <= TITLE_MAX, `The title must be at most ${TITLE_MAX} characters`)
        .refine((s) => !containsForbiddenText(s, false), "The title contains characters that are not allowed")
        .transform((s) => (s === "" ? null : s))
        .optional(),
    ),
    acceptsComplaints: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    emailNotifications: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .strict();

export function parseStaffSettings(source: { get(name: string): unknown }) {
  const raw = (k: string) => { const v = source.get(k); return v === null ? undefined : v; };
  return staffSettingsSchema.safeParse({ title: raw("title"), acceptsComplaints: raw("acceptsComplaints"), emailNotifications: raw("emailNotifications") });
}

export const settingsUpdate = (i: z.infer<typeof staffSettingsSchema>) =>
  ({ title: i.title ?? null, accepts_complaints: i.acceptsComplaints, email_notifications: i.emailNotifications }) as const;

const settingsRow = z.object({
  title: z.string().nullable(), accepts_complaints: z.boolean(), department_id: z.string().uuid().nullable(),
  email_notifications: z.boolean().optional(),
});
export function parseSettingsRow(row: unknown) {
  const r = settingsRow.safeParse(row);
  return r.success
    ? { title: r.data.title ?? "", acceptsComplaints: r.data.accepts_complaints, departmentId: r.data.department_id, emailNotifications: r.data.email_notifications ?? true }
    : null;
}

export const ASSIGNMENT_COLUMNS = "id,lecturer_profile_id,scope_type,level_id,department_id,is_active" as const;
export const SCOPE_TYPES = ["institution", "level", "department", "department_level"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];
const assignmentRow = z.object({
  id: z.string().uuid(), lecturer_profile_id: z.string().uuid(), scope_type: z.enum(SCOPE_TYPES),
  level_id: z.string().uuid().nullable(), department_id: z.string().uuid().nullable(), is_active: z.boolean(),
});
export type AssignmentRow = { id: string; lecturerId: string; scope: ScopeType; levelId: string | null; departmentId: string | null; active: boolean };
export function parseAssignments(data: unknown): AssignmentRow[] | null {
  const r = z.array(assignmentRow).safeParse(data);
  return r.success ? r.data.map((a) => ({ id: a.id, lecturerId: a.lecturer_profile_id, scope: a.scope_type, levelId: a.level_id, departmentId: a.department_id, active: a.is_active })) : null;
}

/** "200 Level in Computer Science", "All levels in Physics", "Entire institution". */
export function describeScope(a: Pick<AssignmentRow, "scope" | "levelId" | "departmentId">, levels: ReadonlyMap<string, string>, departments: ReadonlyMap<string, string>): string {
  const level = a.levelId ? (levels.get(a.levelId) ?? "a level") : "";
  const dept = a.departmentId ? (departments.get(a.departmentId) ?? "a department") : "";
  switch (a.scope) {
    case "institution": return "Entire institution";
    case "level": return `${level}, all departments`;
    case "department": return `All levels in ${dept}`;
    case "department_level": return `${level} in ${dept}`;
  }
}
