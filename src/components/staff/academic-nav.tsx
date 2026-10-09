// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import Link from "next/link";
import type { Reference } from "@/lib/staff/data";

/**
 * Level and department shortcuts. A link is only a pre-set filter: the database still returns
 * just the complaints this staff member is authorised for, so an empty tab is normal.
 */
export function AcademicNav({ reference, activeLevelId, activeDepartmentId }: { reference: Reference | null; activeLevelId?: string; activeDepartmentId?: string }) {
  if (!reference) return null;
  const chip = (active: boolean) => `rounded-md px-3 py-1.5 text-sm ${active ? "bg-brand-700 text-white" : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"}`;
  return (
    <div className="space-y-2">
      <nav aria-label="Levels" className="flex flex-wrap gap-1">
        <Link href="/lecturer/complaints" className={chip(!activeLevelId && !activeDepartmentId)}>All authorised complaints</Link>
        {reference.activeLevels.map((l) => (
          <Link key={l.id} href={`/lecturer/levels/${l.id}`} aria-current={l.id === activeLevelId ? "page" : undefined} className={chip(l.id === activeLevelId)}>{l.name}</Link>
        ))}
      </nav>
      <nav aria-label="Departments" className="flex flex-wrap gap-1">
        {reference.activeDepartments.map((d) => (
          <Link key={d.id} href={activeLevelId ? `/lecturer/levels/${activeLevelId}?departmentId=${d.id}` : `/lecturer/departments/${d.id}`} aria-current={d.id === activeDepartmentId ? "page" : undefined} className={chip(d.id === activeDepartmentId)}>{d.name}</Link>
        ))}
      </nav>
    </div>
  );
}
