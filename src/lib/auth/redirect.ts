// Redirect and request-origin hardening (pure).
import { allowedRolesForPath, firstSegment, homePathForRole, type Role } from "./roles";

const PLACEHOLDER_ORIGIN = "http://placeholder.invalid";
const AUTH_AREAS = new Set(["login", "signup", "forgot-password", "reset-password", "auth", "unauthorized", "pending"]);

/**
 * Accepts only same-site relative paths ("/x?y#z"). Anything that a browser
 * could interpret as another origin (//host, /\host, scheme:, control
 * characters, backslashes) falls back to `fallback`.
 */
export function safeRedirectPath(input: unknown, fallback = "/"): string {
  if (typeof input !== "string") return fallback;
  if (input.length === 0 || input.length > 512) return fallback;
  if (!input.startsWith("/") || input.startsWith("//")) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(input)) return fallback;
  try {
    const url = new URL(input, PLACEHOLDER_ORIGIN);
    if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Where to send a user after sign-in: the requested page if it is safe and the
 * user's role may open it, otherwise their own dashboard.
 */
export function resolvePostLoginPath(next: unknown, role: Role): string {
  const home = homePathForRole(role);
  const safe = safeRedirectPath(next, home);
  const pathOnly = safe.split(/[?#]/)[0] ?? "";
  if (AUTH_AREAS.has(firstSegment(pathOnly))) return home;
  const allowed = allowedRolesForPath(pathOnly);
  if (allowed !== null && !allowed.includes(role)) return home;
  return safe;
}

export type PostRequestInfo = {
  readonly origin: string | null | undefined;
  readonly secFetchSite: string | null | undefined;
};

/**
 * CSRF check for state-changing route handlers (sign out). Server Actions get
 * an equivalent check from Next.js itself.
 */
export function isTrustedPost(info: PostRequestInfo, allowedOrigins: readonly string[]): boolean {
  if (info.secFetchSite === "same-origin") return true;
  if (!info.origin) return false;
  try {
    const origin = new URL(info.origin).origin;
    return allowedOrigins.some((allowed) => {
      try {
        return new URL(allowed).origin === origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

const AUTH_CODE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A Supabase PKCE code that landed on the site root ("/?code=<uuid>"): Supabase falls back to its Site URL
 * when the requested return address is not allow-listed. With e-mail confirmation off and invitations using
 * token links, the only flow that produces such a link is password recovery, so it continues to the
 * "choose a new password" page. The code itself is only exchanged (and checked) by /auth/callback.
 */
export function strayAuthCodeRedirect(pathname: string, params: URLSearchParams): { pathname: string; search: string } | null {
  if (pathname !== "/") return null;
  const code = params.get("code");
  if (!code || !AUTH_CODE.test(code)) return null;
  return { pathname: "/auth/callback", search: `?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/reset-password")}` };
}
