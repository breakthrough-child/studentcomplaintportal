// UNVERIFIED: depends on @supabase/supabase-js and server-only, which could not be installed when this was written.
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getPublicEnv } from "@/lib/env/public";
import { mapInviteError } from "./errors";

/**
 * Sends the Supabase invitation e-mail. Uses the SERVICE ROLE, so callers MUST have passed
 * requireRole(["admin"]) first. The database trigger handle_new_auth_user gives the invited account
 * the role from the matching staff_invitations row (or links a pre-registered student record).
 * Requires the server-side service credentials and the invite e-mail template described in the README.
 */
export async function sendInvite(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const site = getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
    const { error } = await createServiceRoleClient().auth.admin.inviteUserByEmail(email, {
      redirectTo: `${site}/auth/callback?next=/reset-password`,
    });
    return error ? { ok: false, message: mapInviteError(error) } : { ok: true };
  } catch {
    // Missing service key or network failure: say so generically, never print configuration.
    return { ok: false, message: "Invitations are not configured on this server yet (service credentials missing)." };
  }
}
