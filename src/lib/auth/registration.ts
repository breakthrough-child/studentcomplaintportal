// Outcome of a self-registration attempt (pure). Turns Supabase Auth's sign-up result into a safe
// message. Provider text is never shown, and nothing here says whether another account exists
// beyond what Supabase itself reveals in the chosen configuration.
import { z } from "zod";
import type { ApprovalState } from "./profile";
import { homePathForRole, type Role } from "./roles";

export type RegistrationOutcome =
  | { readonly kind: "signed_in" }
  | { readonly kind: "confirm_email"; readonly message: string }
  | { readonly kind: "error"; readonly message: string; readonly field?: "email" | "password" };

type AuthErrorLike = { readonly code?: unknown; readonly status?: unknown } | null | undefined;

export const REGISTRATION_REJECTED =
  "Your account could not be created. The registration or staff number may already be in use, the chosen department or level may no longer be available, your school email domain may not be accepted, or self-registration may be switched off. Check your details or contact the university administrator.";

/**
 * Where a newly registered (and signed-in) user goes, from their ACTUAL role and approval state as read
 * back from the database, never from what the form asked for. Students always land on their dashboard,
 * which only shows their status until they are approved (complaint pages re-check approval). Staff who
 * are not approved go to /pending. An unknown state fails closed to /pending for staff.
 */
export function postRegistrationPath(role: Role, state: ApprovalState | null): string {
  if ((role === "lecturer" || role === "main_lecturer") && state !== "approved") return "/pending";
  return homePathForRole(role);
}

export function registrationOutcome(
  result: { readonly hasSession: boolean; readonly error: AuthErrorLike },
): RegistrationOutcome {
  const { error } = result;
  if (error) {
    const code = typeof error.code === "string" ? error.code : "";
    const status = typeof error.status === "number" ? error.status : 0;
    if (code === "weak_password") return { kind: "error", field: "password", message: "That password is too weak. Choose a longer or less common one." };
    if (code === "email_address_invalid") return { kind: "error", field: "email", message: "That email address cannot be used. Check it and try again." };
    if (code === "user_already_exists" || code === "email_exists") {
      return { kind: "error", field: "email", message: "An account with this email may already exist. Sign in, or use Forgot password." };
    }
    if (code === "signup_disabled" || code === "email_provider_disabled") {
      return { kind: "error", message: "Self-registration is not enabled on this server. Contact the university administrator." };
    }
    if (status === 429 || code === "over_email_send_rate_limit" || code === "over_request_rate_limit") {
      return { kind: "error", message: "Too many attempts. Wait a few minutes and try again." };
    }
    // The database trigger refused the account (duplicate number, domain, switched off) or Auth failed.
    return { kind: "error", message: REGISTRATION_REJECTED };
  }
  if (result.hasSession) return { kind: "signed_in" };
  // Only reached while the Supabase project still has "Confirm email" switched on (see README).
  return {
    kind: "confirm_email",
    message:
      "Your account was created, but this server still requires email confirmation: open the link we sent you, then sign in. An administrator must also approve your account before you can use the portal.",
  };
}

/** Active levels and departments offered on the sign-up form (registration_options()). */
export type RegistrationOptions = {
  readonly levels: readonly { id: string; name: string }[];
  readonly departments: readonly { id: string; name: string }[];
};
const optionRow = z.object({ kind: z.enum(["level", "department"]), id: z.string().uuid(), name: z.string(), sort_key: z.number().int() });

/** null when the rows are malformed (fail closed: the form then explains that sign-up is unavailable). */
export function parseRegistrationOptions(data: unknown): RegistrationOptions | null {
  const rows = z.array(optionRow).safeParse(data);
  if (!rows.success) return null;
  const pick = (kind: "level" | "department") => rows.data.filter((r) => r.kind === kind).map((r) => ({ id: r.id, name: r.name }));
  return { levels: pick("level"), departments: pick("department") };
}
