// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { StaffDashboardView } from "@/components/staff/dashboard";
import { getStaffDashboard } from "@/lib/staff/data";

export const metadata: Metadata = { title: "Dashboard" };

export default async function LecturerDashboard() {
  const data = await getStaffDashboard(); // enforces the staff role
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="border-l-4 border-gold-500 pl-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Dashboard</h1>
        <Link href="/lecturer/complaints" className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">Open complaints</Link>
      </div>
      <StaffDashboardView data={data} complaintsBase="/lecturer/complaints" />
    </main>
  );
}
