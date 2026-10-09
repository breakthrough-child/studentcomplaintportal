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
    <main id="main" className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{department?.name ?? "Department"}</h1>
      <AcademicNav reference={reference} activeDepartmentId={departmentId} activeLevelId={result.query.levelId} />
      <ComplaintList base={`/lecturer/departments/${departmentId}`} result={result} reference={reference} fixed={["departmentId"]} />
    </main>
  );
}
