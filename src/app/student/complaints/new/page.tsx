// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { getMyLevelAdvisor, loadFormOptions } from "@/lib/complaints/data";
import { ComplaintForm } from "./complaint-form";

export const metadata: Metadata = { title: "New complaint" };

export default async function NewComplaintPage() {
  const [options, advisor] = await Promise.all([loadFormOptions(), getMyLevelAdvisor()]); // both enforce: signed in, approved student
  if (!options.ok) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="border-l-4 border-gold-500 pl-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">New complaint</h1>
        <p role="alert" className="mt-4 text-red-700">{options.message}</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="border-l-4 border-gold-500 pl-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">New complaint</h1>
      <ComplaintForm
        levels={options.levels.map((l) => ({ id: l.id, name: l.name }))}
        departments={options.departments.map((d) => ({ id: d.id, name: d.name }))}
        categories={options.categories.map((c) => ({ id: c.id, name: c.name, description: c.description, sensitive: c.is_sensitive }))}
        defaultLevelId={options.scope.levelId}
        defaultDepartmentId={options.scope.departmentId}
        allowScopeOverride={options.allowScopeOverride}
        advisor={advisor}
      />
    </main>
  );
}
