// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AcademicNav } from "@/components/staff/academic-nav";
import { ComplaintList } from "@/components/staff/complaint-list";
import { listStaffComplaints, loadReference } from "@/lib/staff/data";
import { complaintIdSchema } from "@/lib/complaints/student-view";

export const metadata: Metadata = { title: "Complaints by department" };

export default async function DepartmentPage({ params, searchParams }: { params: Promise<{ departmentId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { departmentId } = await params;
  if (!complaintIdSchema.safeParse(departmentId).success) notFound();
  const [result, reference] = await Promise.all([listStaffComplaints(await searchParams, { departmentId }), loadReference()]);
  const department = reference?.departments.find((d) => d.id === departmentId);
  if (reference && !department) notFound();
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="border-l-4 border-gold-500 pl-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{department?.name ?? "Department"}</h1>
      <AcademicNav reference={reference} activeDepartmentId={departmentId} activeLevelId={result.query.levelId} />
      <ComplaintList base={`/lecturer/departments/${departmentId}`} result={result} reference={reference} fixed={["departmentId"]} />
    </main>
  );
}
