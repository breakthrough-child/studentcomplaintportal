import { parsePublicEnv, resolveSiteUrl, type PublicEnv } from "./schema";

let cached: PublicEnv | undefined;

/**
 * Browser-safe configuration. Each variable is referenced statically so Next.js
 * can inline it into the client bundle; do not replace this with a loop over
 * process.env.
 */
export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    // VERCEL_* are only present on the server; in the browser this resolves to the inlined value.
    NEXT_PUBLIC_SITE_URL: resolveSiteUrl({
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      VERCEL_URL: process.env.VERCEL_URL,
    }),
  });
  return cached;
}
