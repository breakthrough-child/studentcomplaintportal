// Zod schemas for authentication forms (pure). Everything coming from the
// browser is untrusted and is parsed here before it reaches Supabase.
import { z } from "zod";

const email = z
  .string({ required_error: "Enter your email address", invalid_type_error: "Enter your email address" })
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address")
  .max(320, "Email address is too long")
  .email("Enter a valid email address");

export const loginSchema = z.object({
  email,
  // No composition rules on login: only reject empty and absurdly long input.
  password: z
    .string({ required_error: "Enter your password", invalid_type_error: "Enter your password" })
    .min(1, "Enter your password")
    .max(128, "Password is too long"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const resetPasswordSchema = z
  .object({
    password: z
      .string({ required_error: "Choose a new password", invalid_type_error: "Choose a new password" })
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`),
    confirmPassword: z.string({ required_error: "Repeat the new password", invalid_type_error: "Repeat the new password" }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Email-link types the callback route accepts for verifyOtp(). */
export const otpLinkTypeSchema = z.enum(["invite", "recovery", "signup", "email", "magiclink", "email_change"]);
export type OtpLinkType = z.infer<typeof otpLinkTypeSchema>;

/**
 * Open self-registration for students and lecturers (/signup). Nothing here is checked against a
 * university record: the account is created immediately with the chosen password and starts PENDING.
 * An administrator must approve it before anything protected is reachable; the database enforces that
 * (is_approved_student(), current_user_role()) whatever this form says. The registration type is the
 * only role-related input and the database accepts only "student" or "lecturer" from it.
 */
export const REGISTRATION_KINDS = ["student", "lecturer"] as const;
export type RegistrationKind = (typeof REGISTRATION_KINDS)[number];
export const IDENTIFIER_PATTERN = /^[A-Z0-9][A-Z0-9/._-]{1,39}$/;

const blankToUndefined = (v: unknown) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v);
// Control, zero-width and bidirectional characters (written as escapes, never literally).
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/;

export const registrationSchema = z
  .object({
    kind: z.enum(REGISTRATION_KINDS, { errorMap: () => ({ message: "Choose student or lecturer" }) }),
    fullName: z
      .string({ required_error: "Enter your full name", invalid_type_error: "Enter your full name" })
      .transform((s) => s.replace(/\s+/g, " ").trim())
      .refine((s) => s.length >= 2, "Enter your full name")
      .refine((s) => [...s].length <= 200, "Your name must be at most 200 characters")
      .refine((s) => !UNSAFE_TEXT.test(s), "Your name contains characters that are not allowed"),
    email,
    personalEmail: z.preprocess(blankToUndefined, email.optional()),
    identifier: z.preprocess(
      (v) => blankToUndefined(typeof v === "string" ? v.replace(/\s+/g, "").toUpperCase() : v),
      z.string({ invalid_type_error: "Invalid number" }).regex(IDENTIFIER_PATTERN, "Use letters, numbers and / . _ - (2 to 40 characters)").optional(),
    ),
    // Checked against active rows by the database; here only the shape. Level is for students only.
    levelId: z.preprocess(blankToUndefined, z.string({ invalid_type_error: "Choose your level" }).uuid("Choose your level").optional()),
    departmentId: z.preprocess(blankToUndefined, z.string({ invalid_type_error: "Choose your department" }).uuid("Choose your department").optional()),
    password: z
      .string({ required_error: "Choose a password", invalid_type_error: "Choose a password" })
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`),
    confirmPassword: z.string({ required_error: "Repeat the password", invalid_type_error: "Repeat the password" }),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.departmentId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["departmentId"], message: "Choose your department" });
    if (v.kind === "student" && !v.levelId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["levelId"], message: "Choose your level" });
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" })
  .refine((v) => v.personalEmail === undefined || v.personalEmail !== v.email, {
    path: ["personalEmail"],
    message: "Use a different address from your school email, or leave this blank",
  });
export type RegistrationInput = z.infer<typeof registrationSchema>;

/** Sign-up metadata for Supabase Auth. The database re-validates every value and ignores anything else. */
export function registrationMetadata(input: RegistrationInput): Record<string, string> {
  const meta: Record<string, string> = { registration_type: input.kind, full_name: input.fullName };
  if (input.departmentId) meta.department_id = input.departmentId;
  if (input.kind === "student" && input.levelId) meta.level_id = input.levelId;
  if (input.personalEmail) meta.personal_email = input.personalEmail;
  if (input.identifier) meta.identifier = input.identifier;
  return meta;
}
