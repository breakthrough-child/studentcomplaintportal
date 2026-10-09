// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { loadAdminReference } from "@/lib/admin/data";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, Empty, Field, INPUT, LoadError, Page } from "@/components/admin/ui";
import { categoryAction } from "../actions";

export const metadata: Metadata = { title: "Complaint categories" };

type Cat = { id?: string; name?: string; description?: string | null; is_sensitive?: boolean; is_active?: boolean };
function CatFields({ c, n }: { c?: Cat; n: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {c?.id ? <input type="hidden" name="id" value={c.id} /> : null}
      <Field label="Name" name={`name-${n}`}><input id={`name-${n}`} name="name" required maxLength={120} defaultValue={c?.name} className={INPUT} /></Field>
      <Field label="Description (optional)" name={`desc-${n}`}><input id={`desc-${n}`} name="description" maxLength={1000} defaultValue={c?.description ?? ""} className={INPUT} /></Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="isSensitive" defaultChecked={c?.is_sensitive ?? false} /> <span>Sensitive: complaints in this category are visible by institution scope only to main lecturers.</span></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={c ? c.is_active : true} /> Active</label>
    </div>
  );
}

export default async function CategoriesPage() {
  const ref = await loadAdminReference();
  if (!ref) return <Page title="Complaint categories"><LoadError /></Page>;
  return (
    <Page title="Complaint categories" intro="Changing the sensitive flag affects new routing decisions immediately.">
      <Card title="Add a category" id="add"><AdminForm action={categoryAction} submit="Add category"><CatFields n="new" /></AdminForm></Card>
      {ref.categories.length === 0 ? <Empty>No categories yet.</Empty> : ref.categories.map((c) => (
        <Card key={c.id} title={c.name} id={`c-${c.id}`}><AdminForm action={categoryAction} submit="Save changes" tone="plain"><CatFields c={c} n={c.id} /></AdminForm></Card>
      ))}
    </Page>
  );
}
