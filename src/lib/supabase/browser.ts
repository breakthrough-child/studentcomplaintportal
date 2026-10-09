// UNVERIFIED: depends on @supabase/ssr, which could not be installed when this was written.
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public";

/** Browser client. Uses the public anon key only; every request is subject to RLS. */
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
