// UNVERIFIED: depends on next and @supabase/ssr, which could not be installed when this was written.
"use server";

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { fieldErrors, type FormState } from "@/lib/validation/form";

export async function resetPasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };

  // Only someone holding a session created by a valid reset/invite link may set a password.
  const user = await getSessionUser();
  if (!user) redirect("/forgot-password");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, message: "We could not update your password. The link may have expired; request a new one." };
  }

  // End every session for this user (including whoever may have triggered the
  // reset), then make the user sign in with the new password.
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login?reset=success");
}
