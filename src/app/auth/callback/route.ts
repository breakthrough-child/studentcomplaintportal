// UNVERIFIED: depends on next and @supabase/ssr, which could not be installed when this was written.
import { NextResponse, type NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";
import { otpLinkTypeSchema } from "@/lib/validation/auth";

/**
 * Landing point for e-mail links (password reset, invitations). Supports both
 * the PKCE `?code=` flow and the `?token_hash=&type=` flow. Any failure sends
 * the user to /login with a generic message and reveals nothing else.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const destination = safeRedirectPath(searchParams.get("next"), "/");
  const failure = new URL("/login?error=link", request.url);

  const supabase = await createClient();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return NextResponse.redirect(error ? failure : new URL(destination, request.url));
  }

  const tokenHash = searchParams.get("token_hash");
  const type = otpLinkTypeSchema.safeParse(searchParams.get("type"));
  if (tokenHash && type.success) {
    const { error } = await supabase.auth.verifyOtp({ type: type.data, token_hash: tokenHash });
    return NextResponse.redirect(error ? failure : new URL(destination, request.url));
  }

  return NextResponse.redirect(failure);
}
