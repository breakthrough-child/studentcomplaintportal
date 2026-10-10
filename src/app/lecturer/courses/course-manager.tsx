"use client";

import { useActionState, useState, useTransition } from "react";
import type { CourseRow } from "@/lib/courses/schema";
import { initialActionState, type ActionState } from "@/lib/staff/actions";
import { dropCourseAction, newCourseAction, searchCoursesAction, takeCourseAction } from "./actions";

type Choice = { id: string; name: string };
const INPUT = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-gold-500/40";
const PRIMARY = "rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60";
const PLAIN = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60";

function Status({ state }: { state: ActionState }) {
  return state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p> : null;
}

/** One small form per button, so each add / drop reports its own result. */
function CourseButton({ courseId, kind, label }: { courseId: string; kind: "take" | "drop"; label: string }) {
  const [state, run, pending] = useActionState(kind === "take" ? takeCourseAction : dropCourseAction, initialActionState);
  return (
    <form action={run} className="flex flex-col items-end gap-1">
      <input type="hidden" name="courseId" value={courseId} />
      <button type="submit" disabled={pending} className={kind === "take" ? PRIMARY : PLAIN} aria-label={label}>
        {pending ? "…" : kind === "take" ? "Add" : "Drop"}
      </button>
      <Status state={state} />
    </form>
  );
}

export function MyCourseList({ courses, departments, levels }: { courses: readonly CourseRow[]; departments: readonly Choice[]; levels: readonly Choice[] }) {
  const dept = new Map(departments.map((d) => [d.id, d.name]));
  const level = new Map(levels.map((l) => [l.id, l.name]));
  if (courses.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">You have not added any courses yet. Search below to add the courses you take.</p>;
  }
  return (
    <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
      {courses.map((c) => (
        <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900"><span className="mr-2 rounded bg-gold-100 px-1.5 py-0.5 text-sm text-navy-800 dark:bg-gold-500 dark:text-navy-900">{c.code}</span>{c.title}</p>
            <p className="mt-1 text-xs text-slate-600">
              {[c.department_id ? dept.get(c.department_id) : null, c.level_id ? level.get(c.level_id) : null].filter(Boolean).join(" · ") || "No department or level set"}
              {!c.is_active ? " · no longer offered" : ""}
            </p>
          </div>
          <CourseButton courseId={c.id} kind="drop" label={`Drop ${c.code}`} />
        </li>
      ))}
    </ul>
  );
}

export function CourseSearch({ takenIds }: { takenIds: readonly string[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly CourseRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const taken = new Set(takenIds);
  const search = () => start(async () => {
    const r = await searchCoursesAction(query);
    if (r.ok) { setResults(r.courses); setMessage(null); } else { setResults(null); setMessage(r.message); }
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium text-slate-800">
          Find a course
          <input type="search" value={query} maxLength={60} placeholder="Code or title, e.g. CSC 301" className={INPUT}
            onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
        </label>
        <button type="button" onClick={search} disabled={pending} className={PRIMARY}>{pending ? "Searching…" : "Search"}</button>
      </div>
      <div aria-live="polite" className="text-sm">
        {message ? <p role="alert" className="text-red-700">{message}</p> : null}
        {results && results.length === 0 ? <p className="text-slate-600">No course matched. You can add it below.</p> : null}
      </div>
      {results && results.length > 0 ? (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {results.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <p className="min-w-0 text-sm"><span className="font-semibold">{c.code}</span> · {c.title}</p>
              {taken.has(c.id) ? <span className="text-xs font-medium text-green-800">Already yours</span> : <CourseButton courseId={c.id} kind="take" label={`Add ${c.code}`} />}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function NewCourseForm({ departments, levels, homeDepartmentId }: { departments: readonly Choice[]; levels: readonly Choice[]; homeDepartmentId: string | null }) {
  const [state, run, pending] = useActionState(newCourseAction, initialActionState);
  const e = state.fieldErrors;
  return (
    <form action={run} key={state.ok ? "saved" : "draft"} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-800">Course code
          <input name="code" required maxLength={20} placeholder="CSC 301" className={INPUT} aria-invalid={e?.code ? true : undefined} />
          {e?.code ? <span className="mt-1 block text-sm font-normal text-red-700">{e.code}</span> : null}
        </label>
        <label className="text-sm font-medium text-slate-800">Course title
          <input name="title" required maxLength={200} placeholder="Data Structures" className={INPUT} aria-invalid={e?.title ? true : undefined} />
          {e?.title ? <span className="mt-1 block text-sm font-normal text-red-700">{e.title}</span> : null}
        </label>
        <label className="text-sm font-medium text-slate-800">Department (optional)
          <select name="departmentId" defaultValue={homeDepartmentId ?? ""} className={INPUT}>
            <option value="">Not specified</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-800">Level (optional)
          <select name="levelId" defaultValue="" className={INPUT}>
            <option value="">Not specified</option>
            {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>
      <Status state={state} />
      <button type="submit" disabled={pending} className={PRIMARY}>{pending ? "Adding…" : "Add course"}</button>
    </form>
  );
}
