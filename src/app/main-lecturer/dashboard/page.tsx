// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { StaffDashboardView } from "@/components/staff/dashboard";
import { getStaffDashboard, listStaffComplaints, requireMainLecturer } from "@/lib/staff/data";

export const metadata: Metadata = { title: "Dashboard" };

export default async function MainLecturerDashboard() {
  await requireMainLecturer();
  const [data, triage] = await Promise.all([getStaffDashboard(), listStaffComplaints({ view: "triage" })]);
  const waiting = triage.state === "ok" ? triage.items.length : 0;
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {triage.state === "ok" ? (
        <p role="status" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          {waiting}{triage.hasMore ? "+" : ""} complaint(s) need triage. <Link className="underline" href="/main-lecturer/assignments">Review and assign</Link>
        </p>
      ) : null}
      <StaffDashboardView data={data} complaintsBase="/main-lecturer/complaints" />
    </main>
  );
}
