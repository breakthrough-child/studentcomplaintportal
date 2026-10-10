import type { Metadata } from "next";
import { getMyCourses } from "@/lib/courses/data";
import { CourseSearch, MyCourseList, NewCourseForm } from "./course-manager";

export const metadata: Metadata = { title: "My courses" };

export default async function MyCoursesPage() {
  const c = await getMyCourses(); // enforces the (approved) lecturer / main lecturer role
  if (!c.ok) {
    return <main id="main" className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8"><p role="alert" className="text-red-700">Your courses could not be loaded. Please try again in a moment.</p></main>;
  }
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="border-l-4 border-gold-500 pl-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">My courses</h1>
        <p className="mt-2 text-sm text-slate-600">
          Students who do not know your department can find you by searching a course code or title. Add the courses you take this session and drop them whenever they change.
        </p>
      </header>
      <section aria-labelledby="mine" className="space-y-3">
        <h2 id="mine" className="font-semibold text-slate-900">Courses you take ({c.courses.length})</h2>
        <MyCourseList courses={c.courses} departments={c.departments} levels={c.levels} />
      </section>
      <section aria-labelledby="find" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 id="find" className="font-semibold text-slate-900">Add a course from the catalogue</h2>
        <CourseSearch takenIds={c.courses.map((x) => x.id)} />
      </section>
      <section aria-labelledby="new" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 id="new" className="font-semibold text-slate-900">Course not listed?</h2>
        <p className="text-sm text-slate-600">Add it to the catalogue. If a course with the same code already exists, it is simply added to your courses.</p>
        <NewCourseForm departments={c.departments} levels={c.levels} homeDepartmentId={c.homeDepartmentId} />
      </section>
    </main>
  );
}
