// Maps database / auth errors from admin writes to safe messages (pure). Raw messages are never shown.
export type AdminContext = "department" | "level" | "category" | "student" | "invitation" | "user" | "assignment" | "setting" | "registration";

const NAMES: Record<AdminContext, string> = {
  department: "department", level: "level", category: "category", student: "student",
  invitation: "invitation", user: "user", assignment: "assignment", setting: "setting", registration: "registration",
};

const UNIQUE: Record<AdminContext, string> = {
  department: "A department with that name or code already exists.",
  level: "A level with that name or number already exists.",
  category: "A category with that name already exists.",
  student: "A student with that email or registration number already exists.",
  invitation: "An open invitation for that email already exists. Use Resend instead.",
  user: "That change conflicts with an existing record.",
  assignment: "That lecturer already has this assignment.",
  setting: "That change conflicts with an existing record.",
  registration: "That change conflicts with an existing record.",
};

export function mapAdminError(error: unknown, ctx: AdminContext): string {
  const code = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
  switch (code) {
    case "23505": return UNIQUE[ctx];
    case "23503": return `This ${NAMES[ctx]} is still used by other records. Deactivate it instead of deleting it.`;
    case "23514": case "22023": case "22P02": return "Some values are not allowed. Check the form and try again.";
    case "42501": return "You do not have permission to make that change.";
    case "P0002": return `That ${NAMES[ctx]} no longer exists.`;
    case "55000": case "P0001": return "That change is not allowed (for example, you cannot change your own role or remove the last administrator).";
    default: return "The change could not be saved. Please try again.";
  }
}

/** Auth admin API failures while sending an invitation. Never echoes provider text. */
export function mapInviteError(error: unknown): string {
  const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 0;
  const code = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
  if (code === "email_exists" || status === 422) return "That email already has an account. Ask the person to use Forgot password instead.";
  if (status === 429 || code === "over_email_send_rate_limit") return "Too many emails were sent. Wait a few minutes and try again.";
  return "The invitation email could not be sent. The record was kept; use Resend after checking the email settings.";
}
