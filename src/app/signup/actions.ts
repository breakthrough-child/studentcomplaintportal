// UNVERIFIED against a live Supabase project: Auth sign-up behaviour depends on the project's settings (see README).
"use server";

import { redirect } from "next/navigation";
import { getPublicEnv } from "@/lib/env/public";
import { PROFILE_COLUMNS, parseApprovalState, usableProfile } from "@/lib/auth/profile";
import { postRegistrationPath, registrationOutcome } from "@/lib/auth/registration";
import { createClient } from "@/lib/supabase/server";
import { registrationMetadata, registrationSchema } from "@/lib/validation/auth";
import { fieldErrors, type FormState } from "@/lib/validation/form";

export type RegistrationValues = { kind: string; fullName: string; email: string; personalEmail: string; identifier: string; levelId: string; departmentId: string };
export type RegistrationState = FormState & { readonly values?: RegistrationValues };

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.slice(0, 400) : "");

/**
 * Public action (no session). Creates the Supabase Auth account with the user's own password through the
 * ordinary anon-key sign-up API; no service-role key is involved. With "Confirm email" off in Supabase the
 * new user is signed in immediately. The database trigger creates the profile IN THE SAME TRANSACTION as the
 * auth user, so a failed profile creation rolls the whole sign-up back (no half-created accounts). The
 * account is PENDING: signing up never grants approval or any role beyond student / lecturer.
 */
export async function registerAction(_previous: RegistrationState, formData: FormData): Promise<RegistrationState> {
  // Passwords are never echoed back into the form.
  const values: RegistrationValues = {
    kind: text(formData.get("kind")),
    fullName: text(formData.get("fullName")),
    email: text(formData.get("email")),
    personalEmail: text(formData.get("personalEmail")),
    identifier: text(formData.get("identifier")),
    levelId: text(formData.get("levelId")),
    departmentId: text(formData.get("departmentId")),
  };
  const parsed = registrationSchema.safeParse({
    ...values,
    levelId: values.kind === "student" ? values.levelId : undefined, // lecturers have no level
    password: formData.get("password") ?? undefined,
    confirmPassword: formData.get("confirmPassword") ?? undefined,
  });
  if (!parsed.success) return { ok: false, message: "Please correct the highlighted fields.", fieldErrors: fieldErrors(parsed.error), values };

  const site = getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  const supabase = await createClient();
  let outcome;
  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${site}/auth/callback?next=/login`,
        data: registrationMetadata(parsed.data),
      },
    });
    userId = data.user?.id ?? null;
    outcome = registrationOutcome({ hasSession: Boolean(data.session), error });
  } catch {
    console.error("self-registration failed"); // never log the address or the password
    outcome = registrationOutcome({ hasSession: false, error: { status: 500 } });
  }

  if (outcome.kind === "signed_in") {
    // Route by what the database actually created (role + approval), read with the new session under RLS.
    const [{ data: row }, { data: state }] = await Promise.all([
      supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId ?? "").maybeSingle(),
      supabase.rpc("my_approval_status"),
    ]);
    const profile = usableProfile(row);
    if (!profile) {
      // The profile is created atomically with the account, so this is a read failure: do not guess a role.
      await supabase.auth.signOut({ scope: "local" });
      return { ok: true, message: "Your account was created. Please sign in to continue." };
    }
    redirect(postRegistrationPath(profile.role, parseApprovalState(state)));
  }
  if (outcome.kind === "confirm_email") return { ok: true, message: outcome.message };
  return {
    ok: false,
    message: outcome.message,
    fieldErrors: outcome.field ? { [outcome.field]: outcome.message } : undefined,
    values,
  };
}
