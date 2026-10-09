// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import type { ImportState } from "@/lib/admin/data";
import { importAction } from "../actions";

export function ImportForm() {
  const [state, run, pending] = useActionState<ImportState, FormData>(importAction, { ok: false });
  return (
    <form action={run} className="space-y-3">
      <div>
        <label htmlFor="file" className="block text-sm font-medium">CSV file</label>
        <input id="file" name="file" type="file" accept=".csv,text/csv" required className="mt-1 block text-sm" />
        <p className="mt-1 text-xs text-slate-500">First row exactly: school_email,full_name,registration_number,level,department. Level by name or number. Rows are imported as approved. At most 500 rows.</p>
      </div>
      <div className="flex gap-2">
        <button type="submit" name="intent" value="check" disabled={pending} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">Check file</button>
        <button type="submit" name="intent" value="import" disabled={pending} className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">Import valid file</button>
      </div>
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p> : null}
      {state.rows && state.rows.some((r) => !r.ok) ? (
        <ul className="list-disc pl-5 text-sm text-red-700">
          {state.rows.flatMap((r) => (r.ok ? [] : [<li key={r.line}>Line {r.line}: {r.error}</li>]))}
        </ul>
      ) : null}
    </form>
  );
}
