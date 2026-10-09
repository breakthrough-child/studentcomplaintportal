// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { loadAdminReference } from "@/lib/admin/data";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, Empty, Field, INPUT, LoadError, Page } from "@/components/admin/ui";
import { levelAction } from "../actions";

export const metadata: Metadata = { title: "Academic levels" };

type Lv = { id?: string; name?: string; level_number?: number; is_active?: boolean };
function LevelFields({ l, n }: { l?: Lv; n: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {l?.id ? <input type="hidden" name="id" value={l.id} /> : null}
      <Field label="Name" name={`name-${n}`}><input id={`name-${n}`} name="name" required maxLength={60} defaultValue={l?.name} placeholder="300 Level" className={INPUT} /></Field>
      <Field label="Level number" name={`num-${n}`}><input id={`num-${n}`} name="levelNumber" required inputMode="numeric" defaultValue={l?.level_number} placeholder="300" className={INPUT} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={l ? l.is_active : true} /> Active</label>
    </div>
  );
}

export default async function LevelsPage() {
  const ref = await loadAdminReference();
  if (!ref) return <Page title="Academic levels"><LoadError /></Page>;
  return (
    <Page title="Academic levels" intro="Levels 100 to 700 are seeded; add or deactivate levels here. Levels are never deleted.">
      <Card title="Add a level" id="add"><AdminForm action={levelAction} submit="Add level"><LevelFields n="new" /></AdminForm></Card>
      {ref.levels.length === 0 ? <Empty>No levels yet.</Empty> : ref.levels.map((l) => (
        <Card key={l.id} title={l.name} id={`l-${l.id}`}><AdminForm action={levelAction} submit="Save changes" tone="plain"><LevelFields l={l} n={l.id} /></AdminForm></Card>
      ))}
    </Page>
  );
}
