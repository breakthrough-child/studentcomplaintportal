// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { ComplaintList } from "@/components/staff/complaint-list";
import { listStaffComplaints, loadReference, requireMainLecturer } from "@/lib/staff/data";

export const metadata: Metadata = { title: "Complaints" };

export default async function MainLecturerComplaints({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireMainLecturer();
  const [result, reference] = await Promise.all([listStaffComplaints(await searchParams), loadReference()]);
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Complaints under your oversight</h1>
      <p className="text-sm text-slate-600">You see the complaints the database authorises for your scope. Restricted complaints appear only with institution-wide access.</p>
      <ComplaintList base="/main-lecturer/complaints" result={result} reference={reference} />
    </main>
  );
}
