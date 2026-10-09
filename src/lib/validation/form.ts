// Shared form-state contract for Server Actions (pure).
import type { ZodError } from "zod";

export type FormState = {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
};

export const initialFormState: FormState = { ok: false };

/** First message per top-level field. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (out[key] === undefined) out[key] = issue.message;
  }
  return out;
}
