// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import Link from "next/link";
import { COMPLAINT_STATUSES, STATUS_LABELS } from "@/lib/complaints/student-view";
import type { StaffListResult, Reference } from "@/lib/staff/data";
import { PRIORITIES, SORT_LABELS, STAFF_SORTS, STAFF_VIEWS, VIEW_LABELS, staffHref, type StaffQuery } from "@/lib/staff/view";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });
const field = "mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm";

/**
 * Filter bar + table for a staff complaint list. `fixed` names filters that come from the page
 * path (level or department pages) and are therefore not shown as editable fields.
 */
export function ComplaintList({
  base, result, reference, fixed = [], detailBase = "/lecturer/complaints",
}: {
  base: string; result: StaffListResult; reference: Reference | null; fixed?: readonly ("levelId" | "departmentId")[]; detailBase?: string;
}) {
  const query: StaffQuery = result.query;
  const levels = reference?.levels ?? [];
  const departments = reference?.departments ?? [];
  const categories = reference?.categories ?? [];
  const nameOf = <T extends { id: string; name: string }>(list: readonly T[], id: string) => list.find((x) => x.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      <nav aria-label="Views" className="flex flex-wrap gap-1">
        {STAFF_VIEWS.map((v) => (
          <Link key={v} href={staffHref(base, query, { view: v, page: 1 })} aria-current={query.view === v ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm ${query.view === v ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"}`}>
            {VIEW_LABELS[v]}
          </Link>
        ))}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-2">
        {query.view !== "all" ? <input type="hidden" name="view" value={query.view} /> : null}
        <label className="text-sm"><span className="block font-medium">Search</span>
          <input type="search" name="q" defaultValue={query.q ?? ""} maxLength={100} placeholder="Title or reference" className={field} /></label>
        <label className="text-sm"><span className="block font-medium">Status</span>
          <select name="status" defaultValue={query.status ?? ""} className={field}>
            <option value="">All</option>
            {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select></label>
        {!fixed.includes("levelId") ? (
          <label className="text-sm"><span className="block font-medium">Level</span>
            <select name="levelId" defaultValue={query.levelId ?? ""} className={field}>
              <option value="">All</option>
              {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></label>
        ) : null}
        {!fixed.includes("departmentId") ? (
          <label className="text-sm"><span className="block font-medium">Department</span>
            <select name="departmentId" defaultValue={query.departmentId ?? ""} className={field}>
              <option value="">All</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select></label>
        ) : null}
        <label className="text-sm"><span className="block font-medium">Category</span>
          <select name="categoryId" defaultValue={query.categoryId ?? ""} className={field}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select></label>
        <label className="text-sm"><span className="block font-medium">Priority</span>
          <select name="priority" defaultValue={query.priority ?? ""} className={field}>
            <option value="">All</option>
            {PRIORITIES.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
          </select></label>
        <label className="text-sm"><span className="block font-medium">Submitted from</span>
          <input type="date" name="from" defaultValue={query.from ?? ""} className={field} /></label>
        <label className="text-sm"><span className="block font-medium">Submitted to</span>
          <input type="date" name="to" defaultValue={query.to ?? ""} className={field} /></label>
        <label className="text-sm"><span className="block font-medium">Sort by</span>
          <select name="sort" defaultValue={query.sort} className={field}>
            {STAFF_SORTS.map((s) => <option key={s} value={s}>{SORT_LABELS[s]}</option>)}
          </select></label>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Apply</button>
      </form>

      {result.state === "error" ? <p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">{result.message}</p> : null}
      {result.state === "empty" ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">No complaints match. You only see complaints you have been authorised for.</p>
      ) : null}

      {result.state === "ok" ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Authorised complaints</caption>
              <thead className="bg-slate-50 text-slate-600">
                <tr><th scope="col" className="px-3 py-2">Complaint</th><th scope="col" className="px-3 py-2">Student</th><th scope="col" className="px-3 py-2">Level / department</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="px-3 py-2">Last activity</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {result.items.map((c) => (
                  <tr key={c.id} className="align-top">
                    <td className="px-3 py-2">
                      <Link href={`${detailBase}/${c.id}`} className="font-medium text-brand-800 underline">{c.title}</Link>
                      <div className="text-xs text-slate-600">{c.reference} · {nameOf(categories, c.categoryId) || "Category"}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-xs">
                        {c.neverOpened ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">New to you</span> : null}
                        {c.unread > 0 ? <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">{c.unread} unread</span> : null}
                        {c.requiresTriage ? <span className="rounded bg-slate-200 px-1.5 py-0.5 font-semibold">Triage</span> : null}
                        {c.isSensitive ? <span className="rounded bg-slate-800 px-1.5 py-0.5 font-semibold text-white">Restricted</span> : null}
                        {c.priority === "high" || c.priority === "urgent" ? <span className="rounded bg-red-100 px-1.5 py-0.5 font-semibold text-red-800">{c.priority}</span> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">{c.studentName}</td>
                    <td className="px-3 py-2">{nameOf(levels, c.levelId)}<div className="text-xs text-slate-600">{nameOf(departments, c.departmentId)}</div></td>
                    <td className="px-3 py-2">{c.statusLabel}</td>
                    <td className="px-3 py-2">{date(c.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="flex justify-between text-sm" aria-label="Pages">
            {query.page > 1 ? <Link className="underline" href={staffHref(base, query, { page: query.page - 1 })}>Previous</Link> : <span />}
            {result.hasMore ? <Link className="underline" href={staffHref(base, query, { page: query.page + 1 })}>Next</Link> : <span />}
          </nav>
        </>
      ) : null}
    </div>
  );
}
