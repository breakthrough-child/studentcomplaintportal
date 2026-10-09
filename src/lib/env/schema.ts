// Pure environment validation. No Next.js, React or Supabase imports, so it can
// be type-checked and unit-tested without any framework installed.
//
// Error messages name the offending variables but NEVER echo their values.
import { z } from "zod";

export type RawEnv = Readonly<Record<string, string | undefined>>;

export class EnvError extends Error {
  constructor(scope: "public" | "server", detail: string) {
    super(`Invalid ${scope} environment: ${detail}`);
    this.name = "EnvError";
  }
}

const LOCAL_HTTP = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?(\/|$)/;

const httpsOrLocalUrl = z
  .string()
  .trim()
  .url()
  .refine((v) => v.startsWith("https://") || LOCAL_HTTP.test(v), {
    message: "must use https (http is allowed only for localhost)",
  });

const emptyToUndefined = (v: unknown): unknown =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpsOrLocalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(20, "looks too short to be a Supabase key"),
  // Only the origin is kept, so it is safe to append paths to.
  NEXT_PUBLIC_SITE_URL: z.preprocess(
    emptyToUndefined,
    httpsOrLocalUrl.default("http://localhost:3000").transform((v) => new URL(v).origin),
  ),
});
export type PublicEnv = z.infer<typeof publicEnvSchema>;

export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(20, "looks too short to be a Supabase key"),
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function formatEnvIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

/** Any NEXT_PUBLIC_* variable that looks like a secret would be shipped to browsers. */
export function assertNoPublicSecrets(env: RawEnv): void {
  const offenders = Object.keys(env).filter(
    (name) => name.startsWith("NEXT_PUBLIC_") && /SERVICE_ROLE|SECRET|PRIVATE/i.test(name),
  );
  if (offenders.length > 0) {
    throw new EnvError("public", `${offenders.join(", ")} would expose a secret to the browser; rename it without the NEXT_PUBLIC_ prefix`);
  }
}

export function parsePublicEnv(raw: RawEnv): PublicEnv {
  const result = publicEnvSchema.safeParse(raw);
  if (!result.success) throw new EnvError("public", formatEnvIssues(result.error));
  return result.data;
}

export function parseServerEnv(raw: RawEnv, anonKey: string): ServerEnv {
  assertNoPublicSecrets(raw);
  const result = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!result.success) throw new EnvError("server", formatEnvIssues(result.error));
  if (result.data.SUPABASE_SERVICE_ROLE_KEY === anonKey.trim()) {
    throw new EnvError("server", "SUPABASE_SERVICE_ROLE_KEY must not be the same value as the anon key");
  }
  return result.data;
}
