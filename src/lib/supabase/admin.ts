// UNVERIFIED: depends on @supabase/supabase-js, which could not be installed when this was written.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";

/**
 * SERVICE-ROLE client. It BYPASSES Row Level Security.
 *
 * Rules (enforced by review and by an ESLint restricted-import rule):
 *  - server code only; never import from a Client Component;
 *  - call it only AFTER the acting user was authorised with requireRole();
 *  - use it only for things RLS cannot express: inviting users through the Auth
 *    admin API, and purging soft-deleted storage objects;
 *  - never use it to read or write complaint content, and never as a shortcut
 *    around a missing RLS policy.
 *
 * Nothing imports this yet; the first use is the admin invitation workflow.
 */
export function createServiceRoleClient() {
  return createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
