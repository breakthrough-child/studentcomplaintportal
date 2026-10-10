// UNVERIFIED: depends on next and @supabase/ssr, which could not be installed when this was written.
"use server";

import { redirect } from "next/navigation";
import { PROFILE_COLUMNS, usableProfile } from "@/lib/auth/profile";
import { resolvePostLoginPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";
import { fieldErrors, type FormState } from "@/lib/validation/form";

// One message for every failure (also "email not confirmed", if the project still requires confirmation).
const GENERIC_FAILURE = "Invalid email or password.";

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: signedIn, error } = await supabase.auth.signInWithPassword(parsed.data);
  // One message for every failure (unknown e-mail, wrong password, unconfirmed
  // address) so the form cannot be used to discover which accounts exist.
  if (error || !signedIn.user) return { ok: false, message: GENERIC_FAILURE };

  // Read the profile with THIS client (it holds the new session in memory), so
  // nothing depends on cookies set earlier in the same request being readable.
  // RLS applies: a deactivated account gets no row.
  const { data: row } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", signedIn.user.id)
    .maybeSingle();
  const profile = usableProfile(row);

  // Credentials were correct, so it is safe to say why access is refused.
  if (!profile) {
    await supabase.auth.signOut({ scope: "local" });
    return { ok: false, message: "Your account is not active. Please contact the university administrator." };
  }

  redirect(resolvePostLoginPath(formData.get("next"), profile.role));
}
