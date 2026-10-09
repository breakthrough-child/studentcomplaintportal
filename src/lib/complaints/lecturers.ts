// Lecturer search (pure). The student-facing selector shows the MINIMUM needed to
// pick a lecturer: name, title and home department. Migration 0008 removed lecturer
// assignments (`scope_labels`) from the database function; this parser also drops
// any column it does not know, as a second layer, so nothing extra reaches a browser.
import { z } from "zod";
import { codePointLength, containsForbiddenText, optionalUuid } from "./schema";

export const LECTURER_QUERY_MAX = 100;
export const LECTURER_PAGE_SIZE = 20;
export const LECTURER_MAX_PAGE = 50;

// The filter fields are named after the LECTURER ("lecturerDepartmentId") so they can never be
// confused with, or leak into, the complaint's own level/department (see schema.ts).
export const lecturerSearchSchema = z
  .object({
    query: z.preprocess(
      (v) => (v === null ? undefined : v),
      z
        .string({ invalid_type_error: "Enter a name to search for" })
        .transform((s) => s.replace(/\s+/g, " ").trim())
        .superRefine((s, ctx) => {
          if (codePointLength(s) > LECTURER_QUERY_MAX) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Search for at most ${LECTURER_QUERY_MAX} characters` });
          }
          if (containsForbiddenText(s, false)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The search contains characters that are not allowed" });
          }
        })
        .transform((s) => (s === "" ? undefined : s))
        .optional(),
    ),
    lecturerDepartmentId: optionalUuid("Choose a valid department"),
    lecturerLevelId: optionalUuid("Choose a valid academic level"),
    page: z.preprocess(
      (v) => (v === null ? undefined : v),
      z.number({ invalid_type_error: "Invalid page" }).int("Invalid page").min(1, "Invalid page").max(LECTURER_MAX_PAGE, "Invalid page").default(1),
    ),
  })
  .strict();
export type LecturerSearchInput = z.infer<typeof lecturerSearchSchema>;

/** Exact parameter list of public.search_lecturers (checked against the migration in tests). */
export type SearchRpcArgs = {
  readonly p_query: string | null;
  readonly p_department_id: string | null;
  readonly p_level_id: string | null;
  readonly p_limit: number;
  readonly p_offset: number;
};

/** Asks for one extra row so the caller can tell whether another page exists. */
export function buildSearchRpcArgs(input: LecturerSearchInput): SearchRpcArgs {
  return {
    p_query: input.query ?? null,
    p_department_id: input.lecturerDepartmentId ?? null,
    p_level_id: input.lecturerLevelId ?? null,
    p_limit: LECTURER_PAGE_SIZE + 1,
    p_offset: (input.page - 1) * LECTURER_PAGE_SIZE,
  };
}

// Only the columns the selector needs are declared; zod drops every other key.
const lecturerRowSchema = z.object({
  profile_id: z.string().uuid(),
  full_name: z.string().min(1),
  title: z.string().nullable(),
  home_department_name: z.string().nullable(),
});

/** What the browser receives. Four fields, nothing about assignments, e-mail or complaints. */
export type LecturerOption = {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  readonly department: string | null;
};

/** Validated, minimised rows; null if the response is not the expected shape (fail closed). */
export function parseLecturerRows(data: unknown): LecturerOption[] | null {
  const result = z.array(lecturerRowSchema).safeParse(data);
  if (!result.success) return null;
  return result.data.map((row) => ({
    id: row.profile_id,
    name: row.full_name,
    title: row.title?.trim() ? row.title.trim() : null,
    department: row.home_department_name?.trim() ? row.home_department_name.trim() : null,
  }));
}

export function pageResults<T>(items: readonly T[], pageSize: number): { items: T[]; hasMore: boolean } {
  return { items: items.slice(0, pageSize), hasMore: items.length > pageSize };
}

/** "Dr Jane Doe — Computer Science"; avoids repeating a title the name already starts with. */
export function lecturerLabel(option: LecturerOption): string {
  const name = option.name.toLowerCase();
  const title = option.title?.toLowerCase();
  const alreadyTitled = title !== undefined && (name === title || name.startsWith(`${title} `));
  const display = option.title && !alreadyTitled ? `${option.title} ${option.name}` : option.name;
  return option.department ? `${display} — ${option.department}` : display;
}

export type LecturerSearchResult =
  | { readonly ok: true; readonly lecturers: readonly LecturerOption[]; readonly hasMore: boolean; readonly page: number }
  | { readonly ok: false; readonly message: string };
