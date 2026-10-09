// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { studentAccess } from "@/lib/student/onboarding";
import { getStudentContext } from "@/lib/student/data";

export const metadata: Metadata = { title: "Profile" };

export default async function StudentProfile() {
  const profile = await requireRole(["student"]);
  const ctx = await getStudentContext();
  const record = ctx.ok ? ctx.record : null;
  const access = ctx.ok ? studentAccess(record) : null;

  return (
    <main id="main" className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      {!ctx.ok ? <p role="alert" className="text-red-700">Your profile could not be loaded. Please try again in a moment.</p> : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-medium">Name</dt><dd>{profile.full_name}</dd></div>
        <div><dt className="font-medium">Email</dt><dd>{profile.email}</dd></div>
        {record ? (
          <>
            <div><dt className="font-medium">Registration number</dt><dd>{record.registration_number}</dd></div>
            <div><dt className="font-medium">Registration status</dt><dd className="capitalize">{record.approval_status}</dd></div>
            <div><dt className="font-medium">Level</dt><dd>{ctx.ok ? (ctx.levelName ?? "Not available") : ""}</dd></div>
            <div><dt className="font-medium">Department</dt><dd>{ctx.ok ? (ctx.departmentName ?? "Not available") : ""}</dd></div>
          </>
        ) : null}
      </dl>
      {access ? <p className="rounded-md bg-slate-50 p-3 text-sm">{access.message}{access.state === "unlinked" ? <> <Link className="underline" href="/student/dashboard">Link it from the dashboard.</Link></> : null}</p> : null}
      <p className="text-sm text-slate-600">Your name, level and department are managed by the university administrator. To change your password, <Link className="underline" href="/forgot-password">request a reset link</Link>.</p>
    </main>
  );
}
