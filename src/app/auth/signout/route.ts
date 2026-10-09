// UNVERIFIED: depends on next and @supabase/ssr, which could not be installed when this was written.
import { NextResponse, type NextRequest } from "next/server";
import { isTrustedPost } from "@/lib/auth/redirect";
import { getPublicEnv } from "@/lib/env/public";
import { createClient } from "@/lib/supabase/server";

/** Sign out this device. POST only, and only from this site (CSRF check). */
export async function POST(request: NextRequest) {
  const trusted = isTrustedPost(
    { origin: request.headers.get("origin"), secFetchSite: request.headers.get("sec-fetch-site") },
    [request.nextUrl.origin, getPublicEnv().NEXT_PUBLIC_SITE_URL],
  );
  if (!trusted) return new NextResponse("Forbidden", { status: 403 });

  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
