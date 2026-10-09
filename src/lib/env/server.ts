// UNVERIFIED: depends on the server-only package, which could not be installed when this was written.
import "server-only";
import { getPublicEnv } from "./public";
import { parseServerEnv, type ServerEnv } from "./schema";

let cached: ServerEnv | undefined;

/**
 * Server-only secrets. Importing this from a Client Component fails the build
 * (the `server-only` package). Only code that truly needs the service-role key
 * should call it; ordinary requests use the user's own session and never load it.
 */
export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env, getPublicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return cached;
}
