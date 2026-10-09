// UNVERIFIED: depends on next and @supabase/ssr, which could not be installed when this was written.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env/public";

/**
 * Refreshes the Supabase session cookie on every matched request and returns
 * the VERIFIED user (getUser() validates the JWT with the Auth server).
 *
 * The middleware only answers "is anybody signed in?". It is deliberately not
 * the authorization boundary: pages and actions call requireRole() and the
 * database enforces RLS regardless of what happens here.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response: response, user };
}

/** Redirect that keeps any session cookies the refresh just set. */
export function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
