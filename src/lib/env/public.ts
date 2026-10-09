import { parsePublicEnv, type PublicEnv } from "./schema";

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
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return cached;
}
