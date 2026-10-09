// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { getReports } from "@/lib/staff/data";
import type { Rollup } from "@/lib/staff/view";

export const metadata: Metadata = { title: "Reports" };

function RollupTable({ title, rows, names }: { title: string; rows: Rollup[] | null; names: Map<string, string> }) {
  if (rows === null) return <p role="alert" className="text-red-700">{title} could not be loaded.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <caption className="p-3 text-left font-medium">{title}</caption>
        <thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-3 py-2">Name</th><th scope="col" className="px-3 py-2">Total</th><th scope="col" className="px-3 py-2">Open</th><th scope="col" className="px-3 py-2">Resolved or closed</th></tr></thead>
        <tbody className="divide-y divide-slate-200">
          {rows.length === 0 ? <tr><td className="px-3 py-3 text-slate-600" colSpan={4}>No data.</td></tr> : rows.map((r) => (
            <tr key={r.id}><th scope="row" className="px-3 py-2 font-normal">{names.get(r.id) ?? "Unknown"}</th><td className="px-3 py-2">{r.total}</td><td className="px-3 py-2">{r.open}</td><td className="px-3 py-2">{r.resolved}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Reports() {
  const r = await getReports(); // enforces the main-lecturer role; every number is limited by RLS
  const levelNames = new Map((r.reference?.levels ?? []).map((l) => [l.id, l.name]));
  const deptNames = new Map((r.reference?.departments ?? []).map((d) => [d.id, d.name]));
  const trend = r.trend ?? [];
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <p className="text-sm text-slate-600">Figures cover only the complaints you are authorised to see.</p>

      {r.totals ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["Total", r.totals.total], ["Open", r.totals.new + r.totals.inProgress + r.totals.awaitingStudent], ["Resolved", r.totals.resolved], ["Closed", r.totals.closed]] as const).map(([k, v]) => (
            <div key={k} className="rounded-lg border border-slate-200 bg-white p-4"><dt className="text-sm text-slate-600">{k}</dt><dd className="mt-1 text-2xl font-semibold">{v}</dd></div>
          ))}
        </dl>
      ) : <p role="alert" className="text-red-700">The totals could not be loaded.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <RollupTable title="By level" rows={r.byLevel} names={levelNames} />
        <RollupTable title="By department" rows={r.byDepartment} names={deptNames} />
      </div>

      <section aria-labelledby="trend">
        <h2 id="trend" className="font-medium">Last 30 days</h2>
        {r.trend === null ? <p role="alert" className="text-red-700">The trend could not be loaded.</p> : (
          <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Complaints submitted and resolved per day</caption>
              <thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-3 py-2">Day (UTC)</th><th scope="col" className="px-3 py-2">Submitted</th><th scope="col" className="px-3 py-2">Resolved</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {trend.filter((d) => d.submitted > 0 || d.resolved > 0).map((d) => <tr key={d.day}><td className="px-3 py-2">{d.day}</td><td className="px-3 py-2">{d.submitted}</td><td className="px-3 py-2">{d.resolved}</td></tr>)}
                {trend.every((d) => d.submitted === 0 && d.resolved === 0) ? <tr><td className="px-3 py-3 text-slate-600" colSpan={3}>No activity in this period.</td></tr> : null}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="overdue">
        <h2 id="overdue" className="font-medium">Overdue{r.overdueAfterDays ? ` (no activity for ${r.overdueAfterDays}+ days)` : ""}</h2>
        {r.overdue === null ? <p role="alert" className="text-red-700">Overdue complaints could not be loaded.</p> : r.overdue.length === 0 ? <p className="mt-2 text-slate-600">Nothing is overdue.</p> : (
          <ul className="mt-2 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
            {r.overdue.map((o) => <li key={o.id}><Link href={`/lecturer/complaints/${o.id}`} className="flex flex-wrap justify-between gap-2 px-4 py-3 hover:bg-slate-50"><span className="font-medium">{o.reference}</span><span className="text-sm text-slate-600">{o.statusLabel} · {o.priority} · {o.daysInactive} days inactive</span></Link></li>)}
          </ul>
        )}
      </section>
    </main>
  );
}
