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

// ---- outgoing e-mail (SMTP) ------------------------------------------------------------------
// Optional. Without SMTP_HOST, notifications stay queued in the database (notification_outbox) and are
// sent once SMTP is configured. Values are never echoed in errors.
export type MailConfig = {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user: string | undefined;
  readonly password: string | undefined;
  readonly from: string;
};
export type MailEnv = { readonly ok: true; readonly config: MailConfig } | { readonly ok: false; readonly reason: string };

const mailSchema = z.object({
  SMTP_HOST: z.string().trim().min(1).max(255).regex(/^[A-Za-z0-9.-]+$/, "must be a host name"),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(587)),
  SMTP_SECURE: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).optional()),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().max(320).optional()),
  SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().max(1024).optional()),
  // "Name <address@domain>" or a bare address.
  SMTP_FROM: z.string().trim().min(3).max(320).regex(/^([^<>\r\n]*<[^@\s<>]+@[^@\s<>]+>|[^@\s<>]+@[^@\s<>]+)$/, "must be an address or Name <address>"),
});

export function parseMailEnv(raw: RawEnv): MailEnv {
  if (!raw.SMTP_HOST || raw.SMTP_HOST.trim() === "") return { ok: false, reason: "SMTP is not configured (SMTP_HOST is empty)" };
  const r = mailSchema.safeParse(raw);
  if (!r.success) return { ok: false, reason: `SMTP configuration is invalid: ${formatEnvIssues(r.error)}` };
  if (Boolean(r.data.SMTP_USER) !== Boolean(r.data.SMTP_PASSWORD)) {
    return { ok: false, reason: "SMTP configuration is invalid: set both SMTP_USER and SMTP_PASSWORD, or neither" };
  }
  return {
    ok: true,
    config: {
      host: r.data.SMTP_HOST,
      port: r.data.SMTP_PORT,
      // Port 465 is TLS from the start; 587/25 upgrade with STARTTLS.
      secure: r.data.SMTP_SECURE ? r.data.SMTP_SECURE === "true" : r.data.SMTP_PORT === 465,
      user: r.data.SMTP_USER,
      password: r.data.SMTP_PASSWORD,
      from: r.data.SMTP_FROM,
    },
  };
}

/** CRON_SECRET protects the scheduled "send queued e-mails" endpoint. Absent or too short = endpoint disabled. */
export function parseCronSecret(raw: RawEnv): string | null {
  const s = raw.CRON_SECRET?.trim();
  return s && s.length >= 24 ? s : null;
}

/**
 * The site's public origin, used in e-mail links (password reset, invitations, notifications).
 * NEXT_PUBLIC_SITE_URL wins when it is a real address. On Vercel, a missing value or a leftover localhost
 * value falls back to the project's production domain (VERCEL_PROJECT_PRODUCTION_URL, or this
 * deployment's VERCEL_URL), so e-mails from the live site never point at localhost. Locally it stays
 * http://localhost:3000.
 */
export function resolveSiteUrl(raw: RawEnv): string | undefined {
  const explicit = raw.NEXT_PUBLIC_SITE_URL?.trim() || undefined;
  if (raw.VERCEL !== "1") return explicit;
  if (explicit && !LOCAL_HTTP.test(explicit)) return explicit;
  const host = (raw.VERCEL_ENV === "production" ? raw.VERCEL_PROJECT_PRODUCTION_URL : undefined) || raw.VERCEL_URL;
  const clean = host?.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return clean && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(clean) ? `https://${clean}` : explicit;
}
