// UNVERIFIED: depends on next and @supabase/ssr, which could not be installed when this was written.
import type { NextRequest } from "next/server";
import { isProtectedPath } from "@/lib/auth/roles";
import { redirectWithCookies, updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (isProtectedPath(pathname) && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return redirectWithCookies(login, response);
  }
  return response;
}

export const config = {
  // Everything except static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|theme-init.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
