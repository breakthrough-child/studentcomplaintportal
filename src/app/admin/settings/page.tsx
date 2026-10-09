// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { loadSettings } from "@/lib/admin/data";
import { SETTING_DEFS, settingToText, type SettingDef } from "@/lib/admin/settings";
import { SUPPORTED_MIMES, mimeLabel } from "@/lib/attachments/policy";
import { AdminForm } from "@/components/admin/admin-form";
import { Card, INPUT, LoadError, Page } from "@/components/admin/ui";
import { settingAction } from "../actions";

export const metadata: Metadata = { title: "Settings" };

function Control({ def, value }: { def: SettingDef; value: unknown }) {
  const id = `v-${def.key}`;
  if (def.kind === "bool") return <label className="flex items-center gap-2 text-sm"><input id={id} type="checkbox" name="value" defaultChecked={value === true} /> Enabled</label>;
  if (def.kind === "domains") return <textarea id={id} name="value" rows={3} defaultValue={settingToText(def, value)} className={INPUT} placeholder="university.edu" />;
  if (def.kind === "mimes") {
    const on = new Set(Array.isArray(value) ? value : []);
    return <div className="grid gap-1 sm:grid-cols-2">{[...new Set(SUPPORTED_MIMES)].map((m) => <label key={m} className="flex items-center gap-2 text-sm"><input type="checkbox" name="value" value={m} defaultChecked={on.has(m)} /> {mimeLabel(m)} <span className="text-xs text-slate-500">{m}</span></label>)}</div>;
  }
  return <input id={id} name="value" inputMode="numeric" defaultValue={settingToText(def, value)} className={INPUT + " max-w-xs"} />;
}

export default async function SettingsPage() {
  const s = await loadSettings();
  if (!s) return <Page title="Settings"><LoadError /></Page>;
  return (
    <Page title="Settings" intro="Each setting is validated and recorded in the audit log. Set the student email domains before go-live: empty means any domain is accepted.">
      {SETTING_DEFS.map((def) => (
        <Card key={def.key} title={def.label} id={`s-${def.key}`}>
          <AdminForm action={settingAction} submit="Save" tone="plain">
            <input type="hidden" name="key" value={def.key} />
            <Control def={def} value={s.get(def.key)} />
            <p className="text-xs text-slate-500">{def.help}</p>
          </AdminForm>
        </Card>
      ))}
    </Page>
  );
}
