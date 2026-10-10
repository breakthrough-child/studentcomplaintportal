import type { Metadata } from "next";
import Link from "next/link";
import { getAdminDashboard } from "@/lib/admin/data";
import { LoadError, Page } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Admin dashboard" };

type Card = { label: string; value: number; href?: string; tone?: "attention" };

function Cards({ title, id, cards, note }: { title: string; id: string; cards: Card[]; note?: string }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="font-medium">{title}</h2>
      {note ? <p className="text-sm text-slate-600">{note}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <span className="block text-3xl font-semibold">{c.value}</span>
              <span className="text-sm text-slate-600">{c.label}</span>
            </>
          );
          const box = `block rounded-md border bg-white p-4 ${c.tone === "attention" && c.value > 0 ? "border-amber-300" : "border-slate-200"}`;
          return (
            <li key={c.label}>
              {c.href ? <Link href={c.href} className={`${box} hover:border-brand-700`}>{body}</Link> : <div className={box}>{body}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default async function AdminDashboard() {
  const d = await getAdminDashboard();
  if (!d) return <Page title="Administration"><LoadError /></Page>;
  const n = d.count;
  const open = n("complaints_submitted") + n("complaints_under_review") + n("complaints_awaiting_student") + n("complaints_reopened");

  return (
    <Page title="Administration" intro="Manage people, approvals and reference data. Administrators see complaint numbers only, never complaint content, unless another administrator explicitly grants them a scope.">
      <Cards title="Waiting for you" id="todo" cards={[
        { label: "Students awaiting approval", value: n("students_pending"), href: "/admin/registrations?kind=student", tone: "attention" },
        { label: "Lecturers awaiting approval", value: n("lecturers_pending"), href: "/admin/registrations?kind=lecturer", tone: "attention" },
        { label: "Open staff invitations", value: d.openInvitations, href: "/admin/lecturers" },
      ]} />
      <Cards title="People" id="people" cards={[
        { label: "Approved students", value: n("students_approved"), href: "/admin/students?filter=approved" },
        { label: "Rejected or suspended students", value: n("students_rejected") + n("students_suspended"), href: "/admin/students" },
        { label: "Pre-registered records not yet claimed", value: n("student_records_unlinked"), href: "/admin/students?filter=unlinked" },
        { label: "Active approved lecturers (incl. main)", value: n("lecturers_approved"), href: "/admin/lecturers" },
        { label: "Main lecturers", value: n("main_lecturers"), href: "/admin/users?filter=main_lecturer" },
        { label: "Administrators", value: n("administrators"), href: "/admin/users?filter=admin" },
        { label: "Deactivated accounts", value: n("deactivated_accounts"), href: "/admin/users?filter=inactive" },
        { label: "All user accounts", value: d.users, href: "/admin/users" },
      ]} />
      <Cards title="Complaints (counts only)" id="complaints" note="Totals across the whole system. Content stays with the students and the lecturers authorised to handle each complaint." cards={[
        { label: "All complaints", value: n("complaints_total") },
        { label: "Open (not yet resolved)", value: open },
        { label: "New (submitted)", value: n("complaints_submitted") },
        { label: "Under review", value: n("complaints_under_review") },
        { label: "Awaiting student", value: n("complaints_awaiting_student") },
        { label: "Reopened", value: n("complaints_reopened") },
        { label: "Resolved", value: n("complaints_resolved") },
        { label: "Closed", value: n("complaints_closed") },
      ]} />
      <Cards title="Configuration" id="config" cards={[
        { label: "Active lecturer assignments", value: d.activeAssignments, href: "/admin/assignments" },
        { label: "Audit log entries", value: d.auditEntries, href: "/admin/audit-logs" },
      ]} />
    </Page>
  );
}
