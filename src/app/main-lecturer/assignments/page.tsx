// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { ComplaintList } from "@/components/staff/complaint-list";
import { listAssignableLecturers, listStaffComplaints, loadReference, requireMainLecturer } from "@/lib/staff/data";

export const metadata: Metadata = { title: "Assignments" };

export default async function MainLecturerAssignments({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMainLecturer();
  const raw = await searchParams;
  const [triage, reference, lecturers] = await Promise.all([
    listStaffComplaints({ ...raw, view: "triage" }), loadReference(), listAssignableLecturers(),
  ]);
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="border-l-4 border-gold-500 pl-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Assignments and escalations</h1>

      <section aria-labelledby="queue" className="space-y-3">
        <h2 id="queue" className="font-medium">Complaints waiting for triage</h2>
        <p className="text-sm text-slate-600">Escalated and restricted complaints stay with main lecturers until released. Open a complaint to assign it to a lecturer or remove someone&apos;s access.</p>
        <ComplaintList base="/main-lecturer/assignments" result={triage} reference={reference} detailBase="/lecturer/complaints" />
      </section>

      <section aria-labelledby="lecturers" className="space-y-3">
        <h2 id="lecturers" className="font-medium">Lecturers who can be assigned</h2>
        {lecturers === null ? <p role="alert" className="text-red-700">The list of lecturers could not be loaded.</p> : lecturers.length === 0 ? <p className="text-slate-600">No eligible lecturers.</p> : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Assignable lecturers</caption>
              <thead className="bg-slate-50 text-slate-600"><tr><th scope="col" className="px-3 py-2">Lecturer</th><th scope="col" className="px-3 py-2">Home department</th><th scope="col" className="px-3 py-2">Authorised scope</th></tr></thead>
              <tbody className="divide-y divide-slate-200">
                {lecturers.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="px-3 py-2">{l.title ? `${l.title} ` : ""}{l.name}</td>
                    <td className="px-3 py-2">{l.department ?? "None"}</td>
                    <td className="px-3 py-2">{l.scopes.length ? l.scopes.join("; ") : "Explicit assignments only"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-sm text-slate-600">Scope assignments (which levels and departments a lecturer may see) are managed by administrators.</p>
      </section>
    </main>
  );
}
