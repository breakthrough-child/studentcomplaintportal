// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { getAdminDashboard } from "@/lib/admin/data";
import { LoadError, Page } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin dashboard" };

export default async function AdminDashboard() {
  const d = await getAdminDashboard();
  if (!d) return <Page title="Administration"><LoadError /></Page>;
  const cards = [
    { label: "User accounts", value: d.users, href: "/admin/users" },
    { label: "Students awaiting approval", value: d.pendingStudents, href: "/admin/students?filter=pending" },
    { label: "Registered students", value: d.students, href: "/admin/students" },
    { label: "Open staff invitations", value: d.openInvitations, href: "/admin/lecturers" },
    { label: "Active lecturer assignments", value: d.activeAssignments, href: "/admin/assignments" },
    { label: "Audit log entries", value: d.auditEntries, href: "/admin/audit-logs" },
  ];
  return (
    <Page title="Administration" intro="Manage people and reference data. Administrators cannot read or act on complaints.">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.label}><Link href={c.href} className="block rounded-md border border-slate-200 bg-white p-4 hover:border-brand-700">
            <span className="block text-3xl font-semibold">{c.value}</span><span className="text-sm text-slate-600">{c.label}</span>
          </Link></li>
        ))}
      </ul>
    </Page>
  );
}
