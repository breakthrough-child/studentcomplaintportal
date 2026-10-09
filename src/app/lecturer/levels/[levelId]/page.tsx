// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AcademicNav } from "@/components/staff/academic-nav";
import { ComplaintList } from "@/components/staff/complaint-list";
import { listStaffComplaints, loadReference } from "@/lib/staff/data";
import { complaintIdSchema } from "@/lib/complaints/student-view";

export const metadata: Metadata = { title: "Complaints by level" };

export default async function LevelPage({ params, searchParams }: { params: Promise<{ levelId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { levelId } = await params;
  if (!complaintIdSchema.safeParse(levelId).success) notFound(); // uuid shape check only
  const [result, reference] = await Promise.all([listStaffComplaints(await searchParams, { levelId }), loadReference()]);
  const level = reference?.levels.find((l) => l.id === levelId);
  if (reference && !level) notFound();
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{level?.name ?? "Level"}</h1>
      <AcademicNav reference={reference} activeLevelId={levelId} activeDepartmentId={result.query.departmentId} />
      <ComplaintList base={`/lecturer/levels/${levelId}`} result={result} reference={reference} fixed={["levelId"]} />
    </main>
  );
}
