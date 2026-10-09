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
 * Student self-service sign-up. The form asks for the school email AND registration number the
 * university registered; no password is chosen here. If both match an unclaimed record, the server
 * e-mails an invitation link and the password is set from that link, so only the mailbox owner can
 * ever set one (nobody can pre-claim someone else's address).
 */
export const SIGNUP_REGISTRATION_PATTERN = /^[A-Z0-9][A-Z0-9/._-]{1,39}$/;
export const signupSchema = z.object({
  email,
  registrationNumber: z
    .string({ required_error: "Enter your registration number", invalid_type_error: "Enter your registration number" })
    .trim()
    .toUpperCase()
    .refine((s) => SIGNUP_REGISTRATION_PATTERN.test(s), "Enter your registration number exactly as the university issued it"),
});
export type SignupInput = z.infer<typeof signupSchema>;
/** Identical whether or not a record matched, so the form cannot reveal who is registered. */
export const SIGNUP_NEUTRAL_MESSAGE =
  "If those details match a student record that has no account yet, we have sent an email with a link to set your password. Check your inbox (and spam folder). If nothing arrives, contact the university administrator.";
