// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { loadFormOptions } from "@/lib/complaints/data";
import { ComplaintForm } from "./complaint-form";

export const metadata: Metadata = { title: "New complaint" };

export default async function NewComplaintPage() {
  const options = await loadFormOptions(); // also enforces: signed in, student role, approved
  if (!options.ok) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">New complaint</h1>
        <p role="alert" className="mt-4 text-red-700">{options.message}</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">New complaint</h1>
      <ComplaintForm
        levels={options.levels.map((l) => ({ id: l.id, name: l.name }))}
        departments={options.departments.map((d) => ({ id: d.id, name: d.name }))}
        categories={options.categories.map((c) => ({ id: c.id, name: c.name, description: c.description, sensitive: c.is_sensitive }))}
        defaultLevelId={options.scope.levelId}
        defaultDepartmentId={options.scope.departmentId}
        allowScopeOverride={options.allowScopeOverride}
      />
    </main>
  );
}
