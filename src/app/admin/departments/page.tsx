// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { loadAdminReference } from "@/lib/admin/data";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, Empty, Field, INPUT, LoadError, Page } from "@/components/admin/ui";
import { departmentAction } from "../actions";

export const metadata: Metadata = { title: "Departments" };

type Dept = { id?: string; name?: string; code?: string | null; description?: string | null; is_active?: boolean };
function DeptFields({ d, n }: { d?: Dept; n: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {d?.id ? <input type="hidden" name="id" value={d.id} /> : null}
      <Field label="Name" name={`name-${n}`}><input id={`name-${n}`} name="name" required maxLength={120} defaultValue={d?.name} className={INPUT} /></Field>
      <Field label="Code (optional)" name={`code-${n}`}><input id={`code-${n}`} name="code" maxLength={20} defaultValue={d?.code ?? ""} className={INPUT} /></Field>
      <Field label="Description (optional)" name={`desc-${n}`}><input id={`desc-${n}`} name="description" maxLength={1000} defaultValue={d?.description ?? ""} className={INPUT} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={d ? d.is_active : true} /> Active (students can choose it)</label>
    </div>
  );
}

export default async function DepartmentsPage() {
  const ref = await loadAdminReference();
  if (!ref) return <Page title="Departments"><LoadError /></Page>;
  return (
    <Page title="Departments" intro="Departments are deactivated, not deleted, so existing complaints keep their history.">
      <Card title="Add a department" id="add"><AdminForm action={departmentAction} submit="Add department"><DeptFields n="new" /></AdminForm></Card>
      {ref.departments.length === 0 ? <Empty>No departments yet.</Empty> : ref.departments.map((d) => (
        <Card key={d.id} title={d.name} id={`d-${d.id}`}><AdminForm action={departmentAction} submit="Save changes" tone="plain"><DeptFields d={d} n={d.id} /></AdminForm></Card>
      ))}
    </Page>
  );
}
