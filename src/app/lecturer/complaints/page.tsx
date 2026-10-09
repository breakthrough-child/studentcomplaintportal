// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { AcademicNav } from "@/components/staff/academic-nav";
import { ComplaintList } from "@/components/staff/complaint-list";
import { listStaffComplaints, loadReference } from "@/lib/staff/data";

export const metadata: Metadata = { title: "Complaints" };

export default async function LecturerComplaints({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const [result, reference] = await Promise.all([listStaffComplaints(raw), loadReference()]); // both enforce the staff role; RLS limits rows
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Complaints</h1>
      <AcademicNav reference={reference} activeLevelId={result.query.levelId} activeDepartmentId={result.query.departmentId} />
      <ComplaintList base="/lecturer/complaints" result={result} reference={reference} />
    </main>
  );
}
