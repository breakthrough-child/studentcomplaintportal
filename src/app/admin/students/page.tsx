// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { listStudents, loadAdminReference } from "@/lib/admin/data";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, Empty, Field, INPUT, LoadError, Page, Pager, SearchBar, Table } from "@/components/admin/ui";
import { studentCreateAction, studentInviteAction, studentUpdateAction } from "../actions";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Students" };

const FILTERS = [
  { value: "pending", label: "Pending approval" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" },
  { value: "suspended", label: "Suspended" }, { value: "unlinked", label: "No account yet" },
];
const APPROVALS = ["pending", "approved", "rejected", "suspended"] as const;

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [ref, r] = await Promise.all([loadAdminReference(), listStudents(await searchParams)]);
  if (!ref) return <Page title="Students"><LoadError /></Page>;
  const levelOptions = ref.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>);
  const deptOptions = ref.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>);
  const levelName = new Map(ref.levels.map((l) => [l.id, l.name]));
  const deptName = new Map(ref.departments.map((d) => [d.id, d.name]));
  return (
    <Page title="Students" intro="Register a student's record first; they claim it after signing in with the same school email. Only approved students can submit complaints.">
      <Card title="Register a student" id="add">
        <AdminForm action={studentCreateAction} submit="Register student">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="School email" name="schoolEmail"><input id="schoolEmail" name="schoolEmail" type="email" required className={INPUT} /></Field>
            <Field label="Full name" name="fullName"><input id="fullName" name="fullName" required maxLength={200} className={INPUT} /></Field>
            <Field label="Registration number" name="registrationNumber"><input id="registrationNumber" name="registrationNumber" required maxLength={40} className={INPUT} /></Field>
            <Field label="Level" name="levelId"><select id="levelId" name="levelId" required className={INPUT}>{levelOptions}</select></Field>
            <Field label="Department" name="departmentId"><select id="departmentId" name="departmentId" required className={INPUT}>{deptOptions}</select></Field>
            <Field label="Status" name="approvalStatus"><select id="approvalStatus" name="approvalStatus" defaultValue="approved" className={INPUT}>{APPROVALS.map((a) => <option key={a} value={a}>{a}</option>)}</select></Field>
          </div>
        </AdminForm>
      </Card>
      <Card title="Import students from CSV" id="import"><ImportForm /></Card>
      <SearchBar base="/admin/students" query={r.query} filters={FILTERS} />
      {!r.ok ? <LoadError /> : r.items.length === 0 ? <Empty>No students match.</Empty> : (
        <>
          <Table label="Students" head={["Name / email", "Registration", "Level / department / status", "Account"]}>
            {r.items.map((s) => (
              <tr key={s.id} className="align-top">
                <td className="px-3 py-2"><span className="block font-medium">{s.full_name}</span><span className="text-slate-600">{s.school_email}</span></td>
                <td className="px-3 py-2">{s.registration_number}</td>
                <td className="px-3 py-2">
                  <AdminForm action={studentUpdateAction} submit="Save" tone="plain" className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <select aria-label={`Level for ${s.full_name}`} name="levelId" defaultValue={s.level_id} className={INPUT + " !mt-0 w-auto"}>{levelOptions}</select>
                    <select aria-label={`Department for ${s.full_name}`} name="departmentId" defaultValue={s.department_id} className={INPUT + " !mt-0 w-auto"}>{deptOptions}</select>
                    <select aria-label={`Status for ${s.full_name}`} name="approvalStatus" defaultValue={s.approval_status} className={INPUT + " !mt-0 w-auto"}>{APPROVALS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
                  </AdminForm>
                  <span className="sr-only">{levelName.get(s.level_id)} {deptName.get(s.department_id)}</span>
                </td>
                <td className="px-3 py-2">
                  {s.profile_id ? "Linked" : (
                    <AdminForm action={studentInviteAction} submit="Send invitation" tone="plain" className="space-y-1"><input type="hidden" name="id" value={s.id} /></AdminForm>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pager base="/admin/students" query={r.query} hasMore={r.hasMore} />
        </>
      )}
    </Page>
  );
}
