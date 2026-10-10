"use server";

import { revalidatePath } from "next/cache";
import { addNewCourse, dropCourse, searchCatalogue, takeCourse, type CourseSearch } from "@/lib/courses/data";
import type { ActionState } from "@/lib/staff/actions";

const after = (r: ActionState) => { if (r.ok) revalidatePath("/lecturer/courses"); return r; };

export async function takeCourseAction(_p: ActionState, formData: FormData): Promise<ActionState> { return after(await takeCourse(formData)); }
export async function dropCourseAction(_p: ActionState, formData: FormData): Promise<ActionState> { return after(await dropCourse(formData)); }
export async function newCourseAction(_p: ActionState, formData: FormData): Promise<ActionState> { return after(await addNewCourse(formData)); }
export async function searchCoursesAction(query: string): Promise<CourseSearch> { return searchCatalogue(query); }
