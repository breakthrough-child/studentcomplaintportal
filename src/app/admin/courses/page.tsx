import type { Metadata } from "next";
import { listCourses, loadAdminReference } from "@/lib/admin/data";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, Empty, Field, INPUT, LoadError, Page, Pager, SearchBar, Table } from "@/components/admin/ui";
import { courseAction } from "../actions";

export const metadata: Metadata = { title: "Courses" };

const FILTERS = [{ value: "active", label: "Offered" }, { value: "inactive", label: "No longer offered" }];

export default async function CoursesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [ref, r] = await Promise.all([loadAdminReference(), listCourses(await searchParams)]);
  if (!ref) return <Page title="Courses"><LoadError /></Page>;
  const deptOptions = ref.departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.is_active ? "" : " (inactive)"}</option>);
  const levelOptions = ref.levels.map((l) => <option key={l.id} value={l.id}>{l.name}{l.is_active ? "" : " (inactive)"}</option>);
  return (
    <Page
      title="Courses"
      intro="The course catalogue. Lecturers choose the courses they take from it (and can add a missing course themselves); students find lecturers by course code or title. Mark a course as no longer offered instead of deleting it: it then disappears from searches."
    >
      <Card title="Add a course" id="add">
        <AdminForm action={courseAction} submit="Add course">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Code" name="code"><input id="code" name="code" required maxLength={20} placeholder="CSC 301" className={INPUT} /></Field>
            <Field label="Title" name="title"><input id="title" name="title" required maxLength={200} placeholder="Data Structures" className={INPUT} /></Field>
            <Field label="Department (optional)" name="departmentId"><select id="departmentId" name="departmentId" defaultValue="" className={INPUT}><option value="">Not specified</option>{deptOptions}</select></Field>
            <Field label="Level (optional)" name="levelId"><select id="levelId" name="levelId" defaultValue="" className={INPUT}><option value="">Not specified</option>{levelOptions}</select></Field>
          </div>
          <input type="hidden" name="isActive" value="on" />
        </AdminForm>
      </Card>

      <SearchBar base="/admin/courses" query={r.query} filters={FILTERS} />
      {!r.ok ? <LoadError /> : r.items.length === 0 ? <Empty>No courses match.</Empty> : (
        <>
          <Table label="Courses" head={["Course", "Lecturers", "Edit"]}>
            {r.items.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="px-3 py-2">
                  <span className="block font-semibold">{c.code}</span>
                  <span className="text-slate-600">{c.title}</span>
                  {!c.is_active ? <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">No longer offered</span> : null}
                </td>
                <td className="px-3 py-2">{r.taking.get(c.id) ?? 0}</td>
                <td className="px-3 py-2">
                  <AdminForm action={courseAction} submit="Save" tone="plain" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <input aria-label={`Code for ${c.code}`} name="code" defaultValue={c.code} required maxLength={20} className={INPUT + " !mt-0 w-28"} />
                    <input aria-label={`Title for ${c.code}`} name="title" defaultValue={c.title} required maxLength={200} className={INPUT + " !mt-0 w-56"} />
                    <select aria-label={`Department for ${c.code}`} name="departmentId" defaultValue={c.department_id ?? ""} className={INPUT + " !mt-0 w-auto"}><option value="">No department</option>{deptOptions}</select>
                    <select aria-label={`Level for ${c.code}`} name="levelId" defaultValue={c.level_id ?? ""} className={INPUT + " !mt-0 w-auto"}><option value="">No level</option>{levelOptions}</select>
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={c.is_active} /> Offered</label>
                  </AdminForm>
                </td>
              </tr>
            ))}
          </Table>
          <Pager base="/admin/courses" query={r.query} hasMore={r.hasMore} />
        </>
      )}
    </Page>
  );
}
