import type { Metadata } from "next";
import { listAdvisors, loadAdminReference } from "@/lib/admin/data";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, Empty, Field, INPUT, LoadError, Page, Table, when } from "@/components/admin/ui";
import { advisorRemoveAction, advisorSaveAction } from "../actions";

export const metadata: Metadata = { title: "Level advisors" };

export default async function AdvisorsPage() {
  const [ref, r] = await Promise.all([loadAdminReference(), listAdvisors()]);
  if (!ref || !r.ok) return <Page title="Level advisors"><LoadError /></Page>;
  const dept = new Map(ref.departments.map((d) => [d.id, d.code ? `${d.code} · ${d.name}` : d.name]));
  const level = new Map(ref.levels.map((l) => [l.id, l.name]));
  const levelOrder = new Map(ref.levels.map((l) => [l.id, l.level_number]));
  const rows = [...r.rows].sort((a, b) => (dept.get(a.department_id) ?? "").localeCompare(dept.get(b.department_id) ?? "") || (levelOrder.get(a.level_id) ?? 0) - (levelOrder.get(b.level_id) ?? 0));
  return (
    <Page
      title="Level advisors"
      intro="Appoint one lecturer as the level advisor for each department and level (for example CSC · 400 Level). Students at that level see their advisor and can send a complaint to them in one click. Being an advisor does not give access to any other complaint. Choosing a department and level that already has an advisor replaces them."
    >
      <Card title="Appoint or replace an advisor" id="appoint">
        <AdminForm action={advisorSaveAction} submit="Save advisor">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Department" name="departmentId">
              <select id="departmentId" name="departmentId" required defaultValue="" className={INPUT}>
                <option value="" disabled>Choose…</option>
                {ref.departments.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{dept.get(d.id)}</option>)}
              </select>
            </Field>
            <Field label="Level" name="levelId">
              <select id="levelId" name="levelId" required defaultValue="" className={INPUT}>
                <option value="" disabled>Choose…</option>
                {ref.levels.filter((l) => l.is_active).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Lecturer" name="lecturerId" hint="Active, approved lecturers and main lecturers.">
              <select id="lecturerId" name="lecturerId" required defaultValue="" className={INPUT}>
                <option value="" disabled>Choose…</option>
                {r.lecturers.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
              </select>
            </Field>
          </div>
        </AdminForm>
      </Card>

      {rows.length === 0 ? <Empty>No level advisors have been appointed yet.</Empty> : (
        <Table label="Level advisors" head={["Department", "Level", "Advisor", "Since", ""]}>
          {rows.map((a) => (
            <tr key={`${a.department_id}:${a.level_id}`}>
              <td className="px-3 py-2">{dept.get(a.department_id) ?? "—"}</td>
              <td className="px-3 py-2">{level.get(a.level_id) ?? "—"}</td>
              <td className="px-3 py-2 font-medium">{r.names.get(a.lecturer_profile_id) ?? "Deactivated account"}</td>
              <td className="px-3 py-2">{when(a.created_at)}</td>
              <td className="px-3 py-2">
                <AdminForm action={advisorRemoveAction} submit="Remove" tone="danger" className="inline" confirmText={`Remove the level advisor for ${dept.get(a.department_id) ?? "this department"} · ${level.get(a.level_id) ?? "this level"}?`}>
                  <input type="hidden" name="departmentId" value={a.department_id} />
                  <input type="hidden" name="levelId" value={a.level_id} />
                </AdminForm>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Page>
  );
}
