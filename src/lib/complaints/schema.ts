// Complaint submission validation (pure: only zod, so it is type-checked and unit-tested).
//
// Trust model: the browser may send anything. This schema accepts ONLY the
// fields a student is allowed to choose. Identity (who the student is), role,
// ownership, status, sensitivity and routing are never read from the request;
// the database derives them from the authenticated session (submit_complaint).
import { z } from "zod";
import type { FormState } from "../validation/form";

export const TITLE_MIN = 3;
export const TITLE_MAX = 200;
export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 10_000;

export const URGENCY_LEVELS = ["low", "normal", "high", "urgent"] as const;
export type Urgency = (typeof URGENCY_LEVELS)[number];
export const URGENCY_LABELS: Readonly<Record<Urgency, string>> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

/** PostgreSQL's char_length() counts code points, JavaScript's .length counts UTF-16 units. */
export function codePointLength(value: string): number {
  return Array.from(value).length;
}

// NUL makes PostgreSQL raise an encoding error, so it is rejected up front.
// Titles are single-line (no control characters at all); bodies may contain tab/newline.
// eslint-disable-next-line no-control-regex
const CONTROL_IN_TITLE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const CONTROL_IN_BODY = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
// Bidirectional override/isolate controls can make text display differently from what it says.
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/;

/** True when the text contains control or bidirectional-override characters (see the rules above). */
export function containsForbiddenText(value: string, multiline: boolean): boolean {
  return (multiline ? CONTROL_IN_BODY : CONTROL_IN_TITLE).test(value) || BIDI_CONTROLS.test(value);
}

function text(opts: { noun: string; article: string; min: number; max: number; multiline: boolean }) {
  const forbidden = opts.multiline ? CONTROL_IN_BODY : CONTROL_IN_TITLE;
  const message = `Enter ${opts.article} ${opts.noun}`;
  return z
    .string({ required_error: message, invalid_type_error: message })
    .transform((s) => (opts.multiline ? s.replace(/\r\n?/g, "\n") : s))
    .transform((s) => s.trim())
    .superRefine((s, ctx) => {
      const length = codePointLength(s);
      if (length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      } else if (length < opts.min) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `The ${opts.noun} must be at least ${opts.min} characters` });
      } else if (length > opts.max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `The ${opts.noun} must be at most ${opts.max} characters` });
      }
      if (forbidden.test(s) || BIDI_CONTROLS.test(s)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `The ${opts.noun} contains characters that are not allowed` });
      }
    });
}

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export function requiredUuid(message: string) {
  return z.string({ required_error: message, invalid_type_error: message }).trim().min(1, message).uuid(message);
}

export function optionalUuid(message: string) {
  return z.preprocess(emptyToUndefined, z.string({ invalid_type_error: message }).trim().uuid(message).optional());
}

export const submitComplaintSchema = z
  .object({
    title: text({ noun: "title", article: "a", min: TITLE_MIN, max: TITLE_MAX, multiline: false }),
    description: text({ noun: "description", article: "a", min: DESCRIPTION_MIN, max: DESCRIPTION_MAX, multiline: true }),
    categoryId: requiredUuid("Choose a category"),
    // The lecturer the complaint is addressed to. Eligibility is decided by the
    // database; this only checks the shape.
    targetLecturerId: requiredUuid("Choose the lecturer this complaint is for"),
    // The complaint's own level/department snapshot. Blank means "use my profile values".
    // These are NEVER derived from the selected lecturer.
    levelId: optionalUuid("Choose a valid academic level"),
    departmentId: optionalUuid("Choose a valid department"),
    urgency: z.preprocess(
      emptyToUndefined,
      z.enum(URGENCY_LEVELS, { errorMap: () => ({ message: "Choose a valid urgency" }) }).default("normal"),
    ),
    acknowledgePrivacy: z.preprocess(
      (v) => v === "on" || v === "true" || v === true,
      z.literal(true, { errorMap: () => ({ message: "Confirm that you have read the privacy notice" }) }),
    ),
  })
  // Unknown keys (studentId, role, status, ...) are an error, not silently accepted.
  .strict();

export type SubmitComplaintInput = z.infer<typeof submitComplaintSchema>;

export const COMPLAINT_FORM_FIELDS = [
  "title",
  "description",
  "categoryId",
  "targetLecturerId",
  "levelId",
  "departmentId",
  "urgency",
  "acknowledgePrivacy",
] as const;
export type ComplaintFormField = (typeof COMPLAINT_FORM_FIELDS)[number];

/** Anything with a FormData-style get(): FormData itself, URLSearchParams, a Map wrapper... */
export interface FieldSource {
  get(name: string): unknown;
}

/** Reads ONLY the allow-listed fields; every other key the client sent is ignored. */
export function extractComplaintFields(source: FieldSource): Record<ComplaintFormField, unknown> {
  const out = {} as Record<ComplaintFormField, unknown>;
  for (const field of COMPLAINT_FORM_FIELDS) {
    const value = source.get(field);
    out[field] = value === null ? undefined : value;
  }
  return out;
}

export function parseSubmitComplaint(source: FieldSource) {
  return submitComplaintSchema.safeParse(extractComplaintFields(source));
}

const ECHO_LIMITS: Readonly<Record<ComplaintFormField, number>> = {
  title: TITLE_MAX + 100,
  description: DESCRIPTION_MAX + 500,
  categoryId: 64,
  targetLecturerId: 64,
  levelId: 64,
  departmentId: 64,
  urgency: 16,
  acknowledgePrivacy: 8,
};

export type EchoedValues = Readonly<Record<ComplaintFormField, string>>;

/**
 * Values to put back into the form after a failed submit (React resets
 * uncontrolled inputs when a form action completes). Strings only, size-capped;
 * files and other types become "".
 */
export function echoComplaintValues(source: FieldSource): EchoedValues {
  const out = {} as Record<ComplaintFormField, string>;
  for (const field of COMPLAINT_FORM_FIELDS) {
    const value = source.get(field);
    out[field] = typeof value === "string" ? value.slice(0, ECHO_LIMITS[field]) : "";
  }
  return out;
}

export type SubmitComplaintState = FormState & {
  readonly reference?: string;
  readonly values?: EchoedValues;
};

export const initialSubmitState: SubmitComplaintState = { ok: false };
