// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { listStaff, loadAdminReference, requireAdmin } from "@/lib/admin/data";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, Empty, Field, INPUT, LoadError, Page, Table, when } from "@/components/admin/ui";
import { staffCancelAction, staffDetailsAction, staffInviteAction, staffResendAction, staffUserAction } from "../actions";

export const metadata: Metadata = { title: "Lecturers and staff" };

export default async function LecturersPage() {
  const [me, ref, staff] = await Promise.all([requireAdmin(), loadAdminReference(), listStaff()]);
  if (!ref || !staff.ok) return <Page title="Lecturers and staff"><LoadError /></Page>;
  const dept = new Map(ref.departments.map((d) => [d.id, d.name]));
  const detail = new Map(staff.details.map((d) => [d.profile_id, d]));
  const open = staff.invitations.filter((i) => !i.consumed_at);
  return (
    <Page title="Lecturers and staff" intro="Lecturers can register themselves and stay pending until approved under Registrations. You can also invite staff: the invitation is recorded first, then the email is sent, and the invited role (including main lecturer or administrator) applies only to that email. Main lecturer and administrator roles can never be self-assigned.">
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
          <Table label="Lecturers" head={["Lecturer", "Details", "Account"]}>
            {staff.users.map((u) => {
              const d = detail.get(u.id);
              return (
                <tr key={u.id} className="align-top">
                  <td className="px-3 py-2">
                    <span className="block font-medium">{u.full_name}</span>
                    <span className="block text-slate-600">{u.email}</span>
                    <span className="block text-xs text-slate-500">
                      {u.is_active ? "Active" : "Deactivated"}{d && d.approval_status !== "approved" ? ` · ${d.approval_status} (see Registrations)` : ""}
                      {d && !d.accepts_complaints ? " · not accepting complaints" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {d ? (
                      <AdminForm action={staffDetailsAction} submit="Save details" tone="plain" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="profileId" value={u.id} />
                        <select aria-label={`Home department for ${u.full_name}`} name="departmentId" defaultValue={d.department_id ?? ""} className={INPUT + " !mt-0 w-auto"}>
                          <option value="">No home department</option>
                          {ref.departments.filter((x) => x.is_active || x.id === d.department_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                        <input aria-label={`Title for ${u.full_name}`} name="title" defaultValue={d.title ?? ""} maxLength={100} placeholder="Title" className={INPUT + " !mt-0 w-24"} />
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="acceptsComplaints" defaultChecked={d.accepts_complaints} /> Accepts complaints</label>
                      </AdminForm>
                    ) : <span className="text-slate-500">—</span>}
                    <span className="sr-only">{d?.department_id ? dept.get(d.department_id) : ""}</span>
                  </td>
                  <td className="px-3 py-2">
                    {u.id === me.id ? <span className="text-slate-500">You</span> : (
                      <AdminForm action={staffUserAction} submit="Save" tone="plain" className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={u.is_active} /> Active</label>
                        <select aria-label={`Role for ${u.full_name}`} name="role" defaultValue={u.role} className={INPUT + " !mt-0 w-auto"}>
                          <option value="lecturer">Lecturer</option><option value="main_lecturer">Main lecturer</option>
                        </select>
                      </AdminForm>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        <p className="mt-2 text-xs text-slate-500">Role changes and (de)activation are checked on the server and in the database (only administrators, never on your own account) and are written to the audit log. Set complaint scopes under Assignments; approve self-registered lecturers under Registrations.</p>
      </Card>
    </Page>
  );
}
