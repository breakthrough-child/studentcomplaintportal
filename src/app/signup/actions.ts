// UNVERIFIED: depends on next and @supabase/supabase-js, which could not be installed when this was written.
"use server";

import { sendInvite } from "@/lib/admin/invite";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { SIGNUP_NEUTRAL_MESSAGE, signupSchema } from "@/lib/validation/auth";
import { fieldErrors, type FormState } from "@/lib/validation/form";

/**
 * Public action (no session). The service role is used for ONE narrow lookup that RLS rightly hides
 * from anonymous callers: "is there an unclaimed student record with this email AND registration
 * number?" Nothing from the record is returned or shown. The answer is always the same neutral message.
 */
export async function signupAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({ email: formData.get("email"), registrationNumber: formData.get("registrationNumber") });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  try {
    const { data, error } = await createServiceRoleClient()
      .from("students")
      .select("id")
      .eq("school_email", parsed.data.email)
      .eq("registration_number", parsed.data.registrationNumber)
      .is("profile_id", null)
      .maybeSingle();
    if (!error && data) {
      const sent = await sendInvite(parsed.data.email);
      if (!sent.ok) console.error("student sign-up invitation failed");
    }
  } catch {
    console.error("student sign-up lookup failed"); // never log the address or the number
  }
  return { ok: true, message: SIGNUP_NEUTRAL_MESSAGE };
}
