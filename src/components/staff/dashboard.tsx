// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import Link from "next/link";
import type { StaffDashboard } from "@/lib/staff/data";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" });

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (<><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 text-2xl font-semibold">{value}</dd></>);
  return href
    ? <Link href={href} className="block rounded-xl border border-slate-200 bg-white shadow-sm p-4 hover:bg-slate-50"><dl>{body}</dl></Link>
    : <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4"><dl>{body}</dl></div>;
}

/** Numbers come from SECURITY INVOKER database functions, so they count only authorised complaints. */
export function StaffDashboardView({ data, complaintsBase }: { data: StaffDashboard; complaintsBase: string }) {
  const { totals, attention, recent } = data;
  return (
    <div className="space-y-6">
      {totals ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Accessible complaints" value={totals.total} href={complaintsBase} />
          <Stat label="New" value={totals.new} href={`${complaintsBase}?view=new`} />
          <Stat label="Unread or unopened" value={attention} href={`${complaintsBase}?view=unread`} />
          <Stat label="In progress" value={totals.inProgress} href={`${complaintsBase}?status=under_review`} />
          <Stat label="Awaiting student" value={totals.awaitingStudent} href={`${complaintsBase}?view=awaiting`} />
          <Stat label="Resolved" value={totals.resolved + totals.closed} href={`${complaintsBase}?status=resolved`} />
        </div>
      ) : <p role="alert" className="text-red-700">The totals could not be loaded.</p>}

      <section aria-labelledby="recent">
        <h2 id="recent" className="font-medium">Recent activity</h2>
        {recent.state === "error" ? <p role="alert" className="mt-2 text-red-700">{recent.message}</p> : null}
        {recent.state === "empty" ? <p className="mt-2 text-slate-600">No complaints have been shared with you yet.</p> : null}
        {recent.state === "ok" ? (
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
            {recent.items.slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link href={`/lecturer/complaints/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-slate-50">
                  <span><span className="font-medium">{c.title}</span><span className="block text-xs text-slate-600">{c.reference} · {c.studentName}</span></span>
                  <span className="text-sm text-slate-600">{c.unread > 0 || c.neverOpened ? <strong className="mr-2 text-amber-800">New</strong> : null}{c.statusLabel} · {date(c.lastActivityAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
