// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { getStatusTotals } from "@/lib/complaints/overview-data";
import { listMyComplaints } from "@/lib/complaints/student-data";
import { studentAccess } from "@/lib/student/onboarding";
import { getStudentContext } from "@/lib/student/data";
import { ClaimForm } from "./claim-form";

export const metadata: Metadata = { title: "Dashboard" };

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <dt className="text-sm text-slate-600">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

export default async function StudentDashboard() {
  const ctx = await getStudentContext();
  if (!ctx.ok) {
    return <main id="main" className="mx-auto max-w-5xl p-6"><p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">Your dashboard could not be loaded. Please try again in a moment.</p></main>;
  }
  const access = studentAccess(ctx.record);

  if (!access.canComplain) {
    return (
      <main id="main" className="mx-auto max-w-2xl space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <p role="status" className="rounded-md border border-slate-200 bg-white p-4">{access.message}</p>
        {access.state === "unlinked" ? <ClaimForm /> : null}
      </main>
    );
  }

  const [totals, recent] = await Promise.all([getStatusTotals(), listMyComplaints({})]);
  return (
    <main id="main" className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link href="/student/complaints/new" className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">Submit a complaint</Link>
      </div>

      {totals ? (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total complaints" value={totals.total} />
          <Stat label="New" value={totals.new} />
          <Stat label="In progress" value={totals.inProgress + totals.awaitingStudent} />
          <Stat label="Resolved or closed" value={totals.resolved + totals.closed} />
        </dl>
      ) : <p role="alert" className="text-red-700">The totals could not be loaded.</p>}
      {totals && totals.awaitingStudent > 0 ? (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{totals.awaitingStudent} complaint(s) are waiting for your reply.</p>
      ) : null}

      <section aria-labelledby="recent">
        <h2 id="recent" className="font-medium">Recent activity</h2>
        {recent.state === "error" ? <p role="alert" className="mt-2 text-red-700">{recent.message}</p> : null}
        {recent.state === "empty" ? <p className="mt-2 text-slate-600">You have not submitted any complaints yet.</p> : null}
        {recent.state === "ok" ? (
          <ul className="mt-2 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
            {recent.items.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link href={`/student/complaints/${c.id}`} className="flex flex-wrap justify-between gap-2 px-4 py-3 hover:bg-slate-50">
                  <span className="font-medium">{c.title}</span>
                  <span className="text-sm text-slate-600">{c.statusLabel} · {when(c.lastActivityAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
}
