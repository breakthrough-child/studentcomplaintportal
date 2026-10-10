import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireStaff, loadReference } from "@/lib/staff/data";
import type { ActionState } from "@/lib/staff/actions";
import { fieldErrors } from "@/lib/validation/form";
import {
  COURSE_COLUMNS, COURSE_SEARCH_LIMIT, courseIdSchema, courseQuerySchema, courseSearchPattern, newCourseSchema, parseCourses, type CourseRow,
} from "./schema";

type Src = { get(name: string): unknown };
const val = (src: Src, k: string) => { const v = src.get(k); return v === null ? undefined : v; };

export type MyCourses =
  | { readonly ok: true; readonly courses: CourseRow[]; readonly departments: { id: string; name: string }[]; readonly levels: { id: string; name: string }[]; readonly homeDepartmentId: string | null }
  | { readonly ok: false };

/** The signed-in lecturer's courses (RLS: own rows only) plus the lists for the "new course" form. */
export async function getMyCourses(): Promise<MyCourses> {
  const me = await requireStaff();
  const supabase = await createClient();
  const [links, ref, details] = await Promise.all([
    supabase.from("lecturer_courses").select("course_id").eq("lecturer_profile_id", me.id),
    loadReference(),
    supabase.from("staff_details").select("department_id").eq("profile_id", me.id).maybeSingle(),
  ]);
  if (links.error || !ref) return { ok: false };
  const ids = (links.data ?? []).map((r) => r.course_id as string);
  let courses: CourseRow[] = [];
  if (ids.length > 0) {
    const { data, error } = await supabase.from("courses").select(COURSE_COLUMNS).in("id", ids).order("code");
    const rows = error ? null : parseCourses(data);
    if (!rows) return { ok: false };
    courses = rows;
  }
  return {
    ok: true,
    courses,
    departments: ref.activeDepartments.map((d) => ({ id: d.id, name: d.name })),
    levels: ref.activeLevels.map((l) => ({ id: l.id, name: l.name })),
    homeDepartmentId: typeof details.data?.department_id === "string" ? details.data.department_id : null,
  };
}

export type CourseSearch = { readonly ok: true; readonly courses: CourseRow[] } | { readonly ok: false; readonly message: string };

/** Active catalogue courses matching a code or title (codes match with or without the space). */
export async function searchCatalogue(query: unknown): Promise<CourseSearch> {
  await requireStaff();
  const q = courseQuerySchema.safeParse(query);
  if (!q.success) return { ok: false, message: q.error.issues[0]?.message ?? "Invalid search" };
  if (q.data === "") return { ok: true, courses: [] };
  const p = courseSearchPattern(q.data);
  const { data, error } = await (await createClient())
    .from("courses").select(COURSE_COLUMNS).eq("is_active", true)
    .or(`code.ilike.${p.code},title.ilike.${p.title}`)
    .order("code").limit(COURSE_SEARCH_LIMIT);
  const rows = error ? null : parseCourses(data);
  return rows ? { ok: true, courses: rows } : { ok: false, message: "The search failed. Please try again." };
}

const ERR: Record<string, string> = {
  "23505": "You already take that course.",
  "22023": "That course is not available.",
  "42501": "Your account cannot change courses (it may still be awaiting approval).",
  "54000": "You have reached the limit. Drop a course first, or try again later.",
};
const failure = (code: string | undefined, fallback: string): ActionState => ({ ok: false, message: (code && ERR[code]) || fallback });

/** Takes an existing catalogue course (RLS: own row, approved staff; trigger: active course, limit). */
export async function takeCourse(src: Src): Promise<ActionState> {
  const me = await requireStaff();
  const p = courseIdSchema.safeParse({ courseId: val(src, "courseId") });
  if (!p.success) return { ok: false, message: "Invalid course." };
  const { error } = await (await createClient()).from("lecturer_courses").insert({ lecturer_profile_id: me.id, course_id: p.data.courseId });
  return error ? failure(error.code, "The course could not be added. Please try again.") : { ok: true, message: "Course added." };
}

/** Drops one of the caller's courses. Deleting someone else's row is impossible under RLS. */
export async function dropCourse(src: Src): Promise<ActionState> {
  const me = await requireStaff();
  const p = courseIdSchema.safeParse({ courseId: val(src, "courseId") });
  if (!p.success) return { ok: false, message: "Invalid course." };
  const { data, error } = await (await createClient())
    .from("lecturer_courses").delete().eq("lecturer_profile_id", me.id).eq("course_id", p.data.courseId).select("course_id");
  if (error) return failure(error.code, "The course could not be dropped. Please try again.");
  return data && data.length > 0 ? { ok: true, message: "Course dropped." } : { ok: false, message: "You do not take that course." };
}

/** Adds a course that is not in the catalogue yet (or reuses the existing one with the same code). */
export async function addNewCourse(src: Src): Promise<ActionState> {
  await requireStaff();
  const p = newCourseSchema.safeParse({ code: val(src, "code"), title: val(src, "title"), departmentId: val(src, "departmentId"), levelId: val(src, "levelId") });
  if (!p.success) return { ok: false, message: "Please correct the highlighted fields.", fieldErrors: fieldErrors(p.error) };
  const { data, error } = await (await createClient()).rpc("add_course", {
    p_code: p.data.code, p_title: p.data.title, p_department_id: p.data.departmentId, p_level_id: p.data.levelId,
  });
  if (error) return failure(error.code, "The course could not be added. Please try again.");
  const created = Array.isArray(data) && data[0] && (data[0] as { created?: unknown }).created === true;
  return {
    ok: true,
    message: created ? `${p.data.code} was added to the catalogue and to your courses.` : `${p.data.code} was already in the catalogue; it is now in your courses.`,
  };
}
