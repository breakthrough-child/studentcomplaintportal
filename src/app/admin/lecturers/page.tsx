// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { listStaff, loadAdminReference } from "@/lib/admin/data";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, Empty, Field, INPUT, LoadError, Page, Table, when } from "@/components/admin/ui";
import { staffCancelAction, staffInviteAction, staffResendAction } from "../actions";

export const metadata: Metadata = { title: "Lecturers and staff" };

export default async function LecturersPage() {
  const [ref, staff] = await Promise.all([loadAdminReference(), listStaff()]);
  if (!ref || !staff.ok) return <Page title="Lecturers and staff"><LoadError /></Page>;
  const dept = new Map(ref.departments.map((d) => [d.id, d.name]));
  const detail = new Map(staff.details.map((d) => [d.profile_id, d]));
  const open = staff.invitations.filter((i) => !i.consumed_at);
  return (
    <Page title="Lecturers and staff" intro="Staff join by invitation only. The invitation record is created first, then the email is sent; the account is accepted only if the invited email matches.">
      <Card title="Invite a staff member" id="invite">
        <AdminForm action={staffInviteAction} submit="Send invitation">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Email" name="email"><input id="email" name="email" type="email" required className={INPUT} /></Field>
            <Field label="Full name" name="fullName"><input id="fullName" name="fullName" required maxLength={200} className={INPUT} /></Field>
            <Field label="Role" name="role"><select id="role" name="role" defaultValue="lecturer" className={INPUT}><option value="lecturer">Lecturer</option><option value="main_lecturer">Main lecturer</option><option value="admin">Administrator</option></select></Field>
            <Field label="Home department (not for administrators)" name="departmentId"><select id="departmentId" name="departmentId" defaultValue="" className={INPUT}><option value="">None</option>{ref.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <Field label="Title (optional)" name="title"><input id="title" name="title" maxLength={100} placeholder="Dr" className={INPUT} /></Field>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmAdmin" /> <span>I confirm this person should become an administrator (required for the Administrator role).</span></label>
        </AdminForm>
      </Card>
      <Card title="Open invitations" id="open">
        {open.length === 0 ? <Empty>No open invitations.</Empty> : (
          <Table label="Open invitations" head={["Name / email", "Role", "Sent", "Actions"]}>
            {open.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2"><span className="block font-medium">{i.full_name}</span>{i.email}</td>
                <td className="px-3 py-2">{i.role.replace("_", " ")}</td><td className="px-3 py-2">{when(i.created_at)}</td>
                <td className="flex flex-wrap gap-2 px-3 py-2">
                  <AdminForm action={staffResendAction} submit="Resend" tone="plain" className="inline"><input type="hidden" name="email" value={i.email} /></AdminForm>
                  <AdminForm action={staffCancelAction} submit="Cancel" tone="danger" className="inline" confirmText={`Cancel the invitation for ${i.email}?`}><input type="hidden" name="email" value={i.email} /></AdminForm>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Lecturers and main lecturers" id="staff">
        {staff.users.length === 0 ? <Empty>No lecturers yet.</Empty> : (
          <Table label="Lecturers" head={["Name", "Email", "Role", "Home department", "Title", "Status"]}>
            {staff.users.map((u) => {
              const d = detail.get(u.id);
              return (
                <tr key={u.id}>
                  <td className="px-3 py-2">{u.full_name}</td><td className="px-3 py-2">{u.email}</td><td className="px-3 py-2">{u.role.replace("_", " ")}</td>
                  <td className="px-3 py-2">{d?.department_id ? dept.get(d.department_id) ?? "—" : "—"}</td><td className="px-3 py-2">{d?.title ?? "—"}</td>
                  <td className="px-3 py-2">{u.is_active ? "Active" : "Deactivated"}{d && !d.accepts_complaints ? ", not accepting" : ""}</td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="mt-2 text-xs text-slate-500">Change role or deactivate accounts under Users; set scopes under Assignments.</p>
      </Card>
    </Page>
  );
}
