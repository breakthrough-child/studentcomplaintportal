// UNVERIFIED: depends on next and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicEnv } from "@/lib/env/public";

/**
 * Per-request Supabase client acting AS THE SIGNED-IN USER (anon key + the
 * user's session cookie). Row Level Security applies to everything it does.
 * Never use this client's `auth.getSession()` for authorization: it reads the
 * cookie without verifying it. Use `auth.getUser()`, which asks the Auth server.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session cookie, so this is safe to ignore.
        }
      },
    },
  });
}
