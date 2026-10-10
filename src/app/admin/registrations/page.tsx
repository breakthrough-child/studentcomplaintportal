import type { Metadata } from "next";
import Link from "next/link";
import { listRegistrations, loadAdminReference } from "@/lib/admin/data";
import { REGISTRATION_STATUS_FILTERS, type RegistrationRow } from "@/lib/admin/view";
import { AdminForm } from "@/components/admin/admin-form";
import { Empty, INPUT, LoadError, Page, Table, when } from "@/components/admin/ui";
import { reviewAction } from "../actions";

export const metadata: Metadata = { title: "Registrations" };

type Ref = NonNullable<Awaited<ReturnType<typeof loadAdminReference>>>;
type Search = Record<string, string | string[] | undefined>;

const STATUS_LABEL: Record<(typeof REGISTRATION_STATUS_FILTERS)[number], string> = {
  pending: "Awaiting approval", approved: "Approved", rejected: "Rejected", suspended: "Suspended", all: "All",
};

function href(params: { status: string; kind: string | null; q?: string; page?: number }): string {
  const p = new URLSearchParams();
  if (params.status !== "pending") p.set("status", params.status);
  if (params.kind) p.set("kind", params.kind);
  if (params.q) p.set("q", params.q);
  if (params.page && params.page > 1) p.set("page", String(params.page));
  const s = p.toString();
  return s ? `/admin/registrations?${s}` : "/admin/registrations";
}

function Decision({ row, reference }: { row: RegistrationRow; reference: Ref }) {
  const levels = reference.levels.filter((l) => l.is_active || l.id === row.level_id);
  const departments = reference.departments.filter((d) => d.is_active || d.id === row.department_id);
  return (
    <div className="space-y-2">
      {row.approval_status !== "approved" ? (
        <AdminForm action={reviewAction} submit="Approve" tone="primary" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="profileId" value={row.profile_id} />
          <input type="hidden" name="decision" value="approved" />
          {row.kind === "student" ? (
            <select aria-label={`Level for ${row.full_name}`} name="levelId" defaultValue={row.level_id ?? ""} required className={INPUT + " !mt-0 w-auto"}>
              <option value="">Level…</option>
              {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          ) : null}
          <select aria-label={`${row.kind === "student" ? "Department" : "Home department"} for ${row.full_name}`} name="departmentId" defaultValue={row.department_id ?? ""}
            required={row.kind === "student"} className={INPUT + " !mt-0 w-auto"}>
            <option value="">{row.kind === "student" ? "Department…" : "Home department (optional)"}</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </AdminForm>
      ) : null}
      {row.approval_status !== "rejected" ? (
        <AdminForm action={reviewAction} submit="Reject" tone="danger" className="inline" confirmText={`Reject the registration of ${row.full_name}? They keep their sign-in but get no access.`}>
          <input type="hidden" name="profileId" value={row.profile_id} />
          <input type="hidden" name="decision" value="rejected" />
        </AdminForm>
      ) : null}
    </div>
  );
}

export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [ref, r] = await Promise.all([loadAdminReference(), listRegistrations(await searchParams)]);
  if (!ref) return <Page title="Registrations"><LoadError /></Page>;
  const { status, kind } = r.filters;
  const level = new Map(ref.levels.map((l) => [l.id, l.name]));
  const dept = new Map(ref.departments.map((d) => [d.id, d.name]));

  return (
    <Page
      title="Registrations"
      intro="Sign-up does not require an email confirmation link, so an email address alone is not proof of who someone is: check the person's identity (for example their registration number with the registry) before approving. Students and lecturers who registered themselves start as pending and cannot see or handle any complaint until you approve them. Applicants chose their level and department (lecturers: home department) at sign-up; check them and correct them in the approval form if needed. Self-registered lecturers always get the ordinary lecturer role; promote them under Users if needed. Every decision is recorded in the audit log."
    >
      {ref.departments.filter((x) => x.is_active).length === 0 ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          There are no active departments yet, so nobody can register and students cannot be approved.{" "}
          <Link href="/admin/departments" className="font-medium underline">Add departments</Link> first.
        </p>
      ) : null}
      <form method="get" action="/admin/registrations" className="flex flex-wrap items-end gap-2" role="search">
        <div><label htmlFor="q" className="block text-xs font-medium">Search</label><input id="q" name="q" defaultValue={r.query.q ?? ""} maxLength={80} className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
        <div><label htmlFor="status" className="block text-xs font-medium">Status</label>
          <select id="status" name="status" defaultValue={status} className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
            {REGISTRATION_STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select></div>
        <div><label htmlFor="kind" className="block text-xs font-medium">Type</label>
          <select id="kind" name="kind" defaultValue={kind ?? ""} className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Students and lecturers</option><option value="student">Students</option><option value="lecturer">Lecturers</option>
          </select></div>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Apply</button>
      </form>

      {!r.ok ? <LoadError /> : r.items.length === 0 ? <Empty>No registrations match.</Empty> : (
        <>
          <Table label="Registrations" head={["Person", "Details", "Status", "Decision"]}>
            {r.items.map((row) => (
              <tr key={row.profile_id} className="align-top">
                <td className="px-3 py-2">
                  <span className="block font-medium">{row.full_name}</span>
                  <span className="block text-slate-600">{row.email}</span>
                  <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs ${row.email_verified ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
                    {row.email_verified ? "Email ownership verified by link" : "Email not verified: confirm identity"}
                  </span>
                  {!row.is_active ? <span className="ml-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">Deactivated</span> : null}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  <span className="block capitalize">{row.role.replace("_", " ")}</span>
                  <span className="block">{row.kind === "student" ? "Registration no." : "Staff ID"}: {row.identifier ?? "not given"}</span>
                  <span className="block">Personal email: {row.personal_email ?? "not given"}</span>
                  {row.kind === "student" && row.level_id ? <span className="block">Level: {level.get(row.level_id) ?? "—"}</span> : null}
                  {row.department_id ? <span className="block">Department: {dept.get(row.department_id) ?? "—"}</span> : null}
                  <span className="block text-xs text-slate-500">Registered {when(row.created_at)}</span>
                </td>
                <td className="px-3 py-2 capitalize">{row.approval_status}</td>
                <td className="px-3 py-2"><Decision row={row} reference={ref} /></td>
              </tr>
            ))}
          </Table>
          {r.query.page > 1 || r.hasMore ? (
            <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
              {r.query.page > 1 ? <Link className="underline" href={href({ status, kind, q: r.query.q, page: r.query.page - 1 })}>Previous</Link> : <span />}
              <span>Page {r.query.page}</span>
              {r.hasMore ? <Link className="underline" href={href({ status, kind, q: r.query.q, page: r.query.page + 1 })}>Next</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </Page>
  );
}
