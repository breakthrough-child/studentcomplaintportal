// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedStudent } from "@/lib/auth/guards";
import {
  LECTURER_PAGE_SIZE,
  buildSearchRpcArgs,
  lecturerSearchSchema,
  pageResults,
  parseLecturerRows,
  parseLevelAdvisor,
  type LecturerSearchResult,
  type LevelAdvisor,
} from "./lecturers";
import { mapRpcError } from "./rpc-errors";

/**
 * Lecturer search for the complaint form. Identity comes from the server session, never from
 * the input; eligibility (active lecturers only, any department or level) is decided inside
 * search_lecturers, which also re-checks that the caller is an approved student.
 */
export async function searchLecturers(input: unknown): Promise<LecturerSearchResult> {
  await requireApprovedStudent();

  const parsed = lecturerSearchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "The search was not accepted." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_lecturers", buildSearchRpcArgs(parsed.data));
  if (error) return { ok: false, message: mapRpcError(error, "search").message };

  const rows = parseLecturerRows(data);
  if (rows === null) return { ok: false, message: mapRpcError(null, "search").message };

  const { items, hasMore } = pageResults(rows, LECTURER_PAGE_SIZE);
  return { ok: true, lecturers: items, hasMore, page: parsed.data.page };
}

/** The signed-in, approved student's level advisor (visibility only; null when none is appointed). */
export async function getMyLevelAdvisor(): Promise<LevelAdvisor | null> {
  await requireApprovedStudent();
  const { data, error } = await (await createClient()).rpc("my_level_advisor");
  return error ? null : parseLevelAdvisor(data);
}

// ---------------------------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------------------------
import {
  academicLevelSchema,
  categorySchema,
  defaultScope,
  departmentSchema,
  parseRows,
  selectableCategories,
  selectableDepartments,
  selectableLevels,
  studentScopeSchema,
  type AcademicLevel,
  type Category,
  type Department,
  type ScopeDefaults,
} from "./options";
import { buildSubmitRpcArgs, parseSubmitResult } from "./rpc";
import { echoComplaintValues, parseSubmitComplaint, type FieldSource, type SubmitComplaintState } from "./schema";
import { fieldErrors } from "@/lib/validation/form";
import { partialFailureMessage } from "@/lib/attachments/form";
import { storeFiles, validateSubmittedFiles } from "@/lib/attachments/upload";

export type FormOptions =
  | {
      readonly ok: true;
      readonly levels: AcademicLevel[];
      readonly departments: Department[];
      readonly categories: Category[];
      readonly scope: ScopeDefaults;
      readonly allowScopeOverride: boolean;
    }
  | { readonly ok: false; readonly message: string };

/** Reference lists for the form, read with the student's own session (RLS applies). */
export async function loadFormOptions(): Promise<FormOptions> {
  const profile = await requireApprovedStudent();
  const supabase = await createClient();
  const [levels, departments, categories, own, setting] = await Promise.all([
    supabase.from("academic_levels").select("id,name,level_number,is_active"),
    supabase.from("departments").select("id,name,code,is_active"),
    supabase.from("complaint_categories").select("id,name,description,is_sensitive,is_active").order("created_at", { ascending: true }),
    supabase.from("students").select("level_id,department_id").eq("profile_id", profile.id).maybeSingle(),
    supabase.from("app_settings").select("value").eq("key", "allow_student_scope_override").maybeSingle(),
  ]);
  const fail = { ok: false, message: "The form could not be loaded. Please try again in a moment." } as const;
  if (levels.error || departments.error || categories.error || own.error) return fail;

  const l = parseRows(academicLevelSchema, levels.data);
  const d = parseRows(departmentSchema, departments.data);
  const c = parseRows(categorySchema, categories.data);
  const s = own.data === null ? null : studentScopeSchema.safeParse(own.data);
  if (!l || !d || !c || (s !== null && !s.success)) return fail;

  const selLevels = selectableLevels(l);
  const selDepartments = selectableDepartments(d);
  return {
    ok: true,
    levels: selLevels,
    departments: selDepartments,
    categories: selectableCategories(c),
    scope: defaultScope(s?.success ? s.data : null, selLevels, selDepartments),
    // Display convenience only; submit_complaint enforces the setting itself.
    allowScopeOverride: setting.error ? true : setting.data?.value !== false,
  };
}

/** Validates and submits through the one atomic database function. */
export async function submitComplaint(source: FieldSource, fileValues: readonly unknown[] = []): Promise<SubmitComplaintState> {
  await requireApprovedStudent();
  const values = echoComplaintValues(source);

  const parsed = parseSubmitComplaint(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), values };

  // Every file is validated BEFORE the complaint is created, so a bad file never leaves a half-saved complaint.
  const prepared = await validateSubmittedFiles(fileValues);
  if (!prepared.ok) return { ok: false, fieldErrors: { files: prepared.errors.join(" ") }, values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_complaint", buildSubmitRpcArgs(parsed.data));
  if (error) {
    const mapped = mapRpcError(error, "submit");
    const field =
      mapped.kind === "invalid_recipient" ? "targetLecturerId"
      : mapped.kind === "invalid_category" ? "categoryId"
      : mapped.kind === "invalid_scope" ? "levelId"
      : null;
    return field
      ? { ok: false, fieldErrors: { [field]: mapped.message }, values }
      : { ok: false, message: mapped.message, values };
  }

  const result = parseSubmitResult(data);
  // The RPC succeeded but the reply was unexpected: do NOT invite a re-submit (it may have been saved).
  if (!result) {
    return { ok: true, message: "Your complaint was submitted, but we could not read its reference number. Please check your complaints list before submitting again." };
  }
  const failed = prepared.files.length > 0 ? await storeFiles(result.id, null, prepared.files) : [];
  return { ok: true, reference: result.reference, message: partialFailureMessage("Your complaint has been submitted.", failed) };
}
