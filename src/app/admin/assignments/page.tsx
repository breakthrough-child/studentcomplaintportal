// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { listAssignments, loadAdminReference } from "@/lib/admin/data";
import { describeScope } from "@/lib/staff/settings";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, Empty, Field, INPUT, LoadError, Page, Table } from "@/components/admin/ui";
import { assignmentCreateAction, assignmentDeleteAction, assignmentToggleAction } from "../actions";

export const metadata: Metadata = { title: "Lecturer assignments" };

export default async function AssignmentsPage() {
  const [ref, a] = await Promise.all([loadAdminReference(), listAssignments()]);
  if (!ref || !a.ok) return <Page title="Lecturer assignments"><LoadError /></Page>;
  const lecturer = new Map(a.lecturers.map((l) => [l.id, l.full_name]));
  const level = new Map(ref.levels.map((l) => [l.id, l.name]));
  const dept = new Map(ref.departments.map((d) => [d.id, d.name]));
  return (
    <Page title="Lecturer assignments" intro="An assignment decides which complaints a lecturer can see by level and department. Institution scope shows non-sensitive complaints to lecturers; sensitive ones only to main lecturers. You cannot assign yourself.">
      <Card title="Add an assignment" id="add">
        <AdminForm action={assignmentCreateAction} submit="Add assignment">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Lecturer" name="lecturerId"><select id="lecturerId" name="lecturerId" required className={INPUT}>{a.lecturers.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}</select></Field>
            <Field label="Scope" name="scopeType"><select id="scopeType" name="scopeType" defaultValue="department_level" className={INPUT}>
              <option value="institution">Whole institution</option><option value="level">One level (all departments)</option><option value="department">One department (all levels)</option><option value="department_level">Department and level</option></select></Field>
            <Field label="Level (if the scope uses one)" name="levelId"><select id="levelId" name="levelId" defaultValue="" className={INPUT}><option value="">None</option>{ref.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="Department (if the scope uses one)" name="departmentId"><select id="departmentId" name="departmentId" defaultValue="" className={INPUT}><option value="">None</option>{ref.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          </div>
        </AdminForm>
      </Card>
      {a.rows.length === 0 ? <Empty>No assignments yet. Lecturers see only complaints addressed or assigned to them.</Empty> : (
        <Table label="Assignments" head={["Lecturer", "Scope", "Status", "Actions"]}>
          {a.rows.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{lecturer.get(r.lecturer_profile_id) ?? "Inactive lecturer"}</td>
              <td className="px-3 py-2">{describeScope({ scope: r.scope_type, levelId: r.level_id, departmentId: r.department_id }, level, dept)}</td>
              <td className="px-3 py-2">{r.is_active ? "Active" : "Inactive"}</td>
              <td className="flex flex-wrap items-center gap-2 px-3 py-2">
                <AdminForm action={assignmentToggleAction} submit={r.is_active ? "Deactivate" : "Activate"} tone="plain" className="inline">
                  <input type="hidden" name="id" value={r.id} />{r.is_active ? null : <input type="hidden" name="isActive" value="on" />}
                </AdminForm>
                <AdminForm action={assignmentDeleteAction} submit="Remove" tone="danger" className="inline" confirmText="Remove this assignment?">
                  <input type="hidden" name="id" value={r.id} /><input type="hidden" name="confirm" value="on" />
                </AdminForm>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
