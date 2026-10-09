// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseName } from "@/lib/complaints/student-view";
import { STUDENT_COLUMNS, claimOutcome, claimSchema, parseStudentRecord, type StudentRecord } from "./onboarding";
import { requireRole } from "@/lib/auth/guards";

export type StudentContext =
  | { readonly ok: true; readonly record: StudentRecord | null; readonly levelName: string | null; readonly departmentName: string | null }
  | { readonly ok: false };

/** The signed-in student's own linked record (RLS: a student can read only that row) plus names. */
export async function getStudentContext(): Promise<StudentContext> {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { data, error } = await supabase.from("students").select(STUDENT_COLUMNS).eq("profile_id", profile.id).maybeSingle();
  if (error) return { ok: false };
  if (data === null) return { ok: true, record: null, levelName: null, departmentName: null };
  const record = parseStudentRecord(data);
  if (!record) return { ok: false };
  const [level, dept] = await Promise.all([
    supabase.from("academic_levels").select("name").eq("id", record.level_id).maybeSingle(),
    supabase.from("departments").select("name").eq("id", record.department_id).maybeSingle(),
  ]);
  return {
    ok: true,
    record,
    levelName: level.error ? null : parseName(level.data),
    departmentName: dept.error ? null : parseName(dept.data),
  };
}

/** Links the caller's verified account to the pre-registered record (rate-limited in the database). */
export async function claimStudentRecord(source: { get(name: string): unknown }): Promise<{ ok: boolean; message: string; fieldError?: string }> {
  await requireRole(["student"]);
  const parsed = claimSchema.safeParse({ registrationNumber: source.get("registrationNumber") ?? undefined });
  if (!parsed.success) return { ok: false, message: "Please correct the registration number.", fieldError: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_student_record", { p_registration_number: parsed.data.registrationNumber });
  return claimOutcome(data, error);
}
