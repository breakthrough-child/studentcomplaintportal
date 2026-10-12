// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use server";

import { revalidatePath } from "next/cache";
import type { AdminState } from "@/lib/admin/schemas";
import * as admin from "@/lib/admin/data";
import { CSV_MAX_BYTES } from "@/lib/admin/csv";

type Run = (src: { get(n: string): unknown }) => Promise<AdminState>;
const wrap = (run: Run, path: string) => async (_prev: AdminState, formData: FormData): Promise<AdminState> => {
  const r = await run(formData);
  if (r.ok) revalidatePath(path);
  return r;
};

export const departmentAction = wrap(admin.saveDepartment, "/admin/departments");
export const levelAction = wrap(admin.saveLevel, "/admin/levels");
export const categoryAction = wrap(admin.saveCategory, "/admin/categories");
export const userAction = wrap(admin.updateUser, "/admin/users");
export const studentCreateAction = wrap(admin.createStudent, "/admin/students");
export const studentUpdateAction = wrap(admin.updateStudent, "/admin/students");
export const studentInviteAction = wrap(admin.inviteStudent, "/admin/students");
export const staffInviteAction = wrap(admin.inviteStaff, "/admin/lecturers");
export const staffResendAction = wrap(admin.resendStaffInvite, "/admin/lecturers");
export const staffDetailsAction = wrap(admin.updateStaffDetails, "/admin/lecturers");
export const staffUserAction = wrap(admin.updateUser, "/admin/lecturers");
export const studentUserAction = wrap(admin.updateUser, "/admin/students");
export const staffCancelAction = wrap(admin.cancelInvitation, "/admin/lecturers");
export const assignmentCreateAction = wrap(admin.createAssignment, "/admin/assignments");
export const assignmentToggleAction = wrap(admin.toggleAssignment, "/admin/assignments");
export const assignmentDeleteAction = wrap(admin.deleteAssignment, "/admin/assignments");
export const settingAction = wrap(admin.saveSetting, "/admin/settings");
export const advisorSaveAction = wrap(admin.saveAdvisor, "/admin/advisors");
export const advisorRemoveAction = wrap(admin.removeAdvisor, "/admin/advisors");
export const courseAction = wrap(admin.saveCourse, "/admin/courses");
export const reviewAction = wrap(admin.reviewRegistration, "/admin/registrations");

export async function importAction(_prev: admin.ImportState, formData: FormData): Promise<admin.ImportState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a CSV file." };
  if (file.size > CSV_MAX_BYTES) return { ok: false, message: "The file is too large (limit 256 KB)." };
  const commit = formData.get("intent") === "import";
  const r = await admin.importStudents(await file.text(), commit);
  if (r.ok && commit) revalidatePath("/admin/students");
  return r;
}
