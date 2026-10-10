// Course catalogue validation and row parsing (pure). The database re-checks everything (RLS, add_course,
// guard triggers); these schemas only give users early, specific messages.
import { z } from "zod";
import { codePointLength, containsForbiddenText } from "../complaints/schema";

export const COURSE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9 /._-]{1,19}$/;
export const COURSE_SEARCH_LIMIT = 20;
export const COURSE_COLUMNS = "id,code,title,department_id,level_id,is_active" as const;

/** "csc   301" -> "CSC 301" (the same normalisation as the database trigger). */
export function normaliseCode(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

const blank = (v: unknown) => (v === null || v === undefined || (typeof v === "string" && v.trim() === "") ? undefined : v);
const optionalId = (message: string) => z.preprocess(blank, z.string({ invalid_type_error: message }).uuid(message).optional()).transform((v) => v ?? null);

export const courseCode = z
  .string({ required_error: "Enter the course code", invalid_type_error: "Enter the course code" })
  .transform(normaliseCode)
  .refine((s) => COURSE_CODE_PATTERN.test(s), "Use a code like CSC 301 (letters, numbers, spaces and / . _ -, up to 20 characters)");

export const courseTitle = z
  .string({ required_error: "Enter the course title", invalid_type_error: "Enter the course title" })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .superRefine((s, ctx) => {
    const n = codePointLength(s);
    if (n < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter the course title" });
    else if (n > 200) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The title must be at most 200 characters" });
    if (containsForbiddenText(s, false)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The title contains characters that are not allowed" });
  });

/** A lecturer adding a course that is not in the catalogue yet. */
export const newCourseSchema = z
  .object({ code: courseCode, title: courseTitle, departmentId: optionalId("Choose a valid department"), levelId: optionalId("Choose a valid level") })
  .strict();

/** Administrator create / edit. */
export const adminCourseSchema = z
  .object({
    id: optionalId("Invalid course"),
    code: courseCode,
    title: courseTitle,
    departmentId: optionalId("Choose a valid department"),
    levelId: optionalId("Choose a valid level"),
    isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  })
  .strict();

export const courseIdSchema = z.object({ courseId: z.string({ invalid_type_error: "Invalid course" }).uuid("Invalid course") }).strict();

export const courseQuerySchema = z
  .string({ invalid_type_error: "Enter a course code or title" })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .refine((s) => codePointLength(s) <= 60, "Search for at most 60 characters")
  .refine((s) => !containsForbiddenText(s, false), "The search contains characters that are not allowed");

const courseRow = z.object({
  id: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  department_id: z.string().uuid().nullable(),
  level_id: z.string().uuid().nullable(),
  is_active: z.boolean(),
});
export type CourseRow = z.infer<typeof courseRow>;

/** null when malformed (fail closed). */
export function parseCourses(data: unknown): CourseRow[] | null {
  const r = z.array(courseRow).safeParse(data);
  return r.success ? r.data : null;
}

/** "CSC 301 · Data Structures" */
export const courseLabel = (c: { code: string; title: string }) => `${c.code} · ${c.title}`;

/** PostgREST ilike pattern that matches a code with or without its space ("csc301" finds "CSC 301"). */
export function courseSearchPattern(q: string): { code: string; title: string } {
  const esc = (s: string) => s.replace(/[\\%_]/g, "\\$&").replace(/[,()"]/g, " ");
  const compact = q.replace(/\s+/g, "");
  // "CSC301" -> "CSC%301": letters then digits may be separated by a space in the stored code.
  const codeLike = esc(compact).replace(/([A-Za-z])(\d)/, "$1%$2");
  return { code: `%${codeLike}%`, title: `%${esc(q)}%` };
}
