// UNVERIFIED: depends on next and @supabase/ssr, which could not be installed when this was written.
"use server";

import { getPublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { fieldErrors, type FormState } from "@/lib/validation/form";

// Identical for known and unknown addresses, so the form cannot be used to
// discover which e-mail addresses have accounts.
const NEUTRAL_MESSAGE = "If an account exists for that address, a password reset link has been sent. Check your inbox.";

export async function forgotPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const siteUrl = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  // Log the error code only (never the address) and still answer neutrally.
  if (error) console.error("resetPasswordForEmail failed", { code: error.code ?? error.status ?? "unknown" });

  return { ok: true, message: NEUTRAL_MESSAGE };
}
