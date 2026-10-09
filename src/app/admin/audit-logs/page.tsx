// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { listAudit } from "@/lib/admin/data";
import { AUDIT_ENTITY_FILTERS, auditSummary } from "@/lib/admin/view";
import { Empty, LoadError, Page, Pager, SearchBar, Table, when } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Audit logs" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const r = await listAudit(await searchParams);
  return (
    <Page title="Audit logs" intro="Append-only record of administrative and workflow changes. Entries cannot be edited or deleted. Names, emails and registration numbers are deliberately not stored in the details.">
      <SearchBar base="/admin/audit-logs" query={r.query} filters={AUDIT_ENTITY_FILTERS.map((e) => ({ value: e, label: e.replace(/_/g, " ") }))} />
      {!r.ok ? <LoadError /> : r.items.length === 0 ? <Empty>No audit entries match.</Empty> : (
        <>
          <Table label="Audit log" head={["When", "Who", "Action", "Record", "Details"]}>
            {r.items.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2">{when(e.created_at)}</td>
                <td className="px-3 py-2">{e.actor_profile_id ? r.names.get(e.actor_profile_id) ?? "Unknown user" : "System"}</td>
                <td className="px-3 py-2">{e.action}</td>
                <td className="px-3 py-2">{e.entity_type}{e.entity_id ? <span className="block break-all text-xs text-slate-500">{e.entity_id}</span> : null}</td>
                <td className="max-w-md break-words px-3 py-2 font-mono text-xs">{auditSummary(e.metadata)}</td>
              </tr>
            ))}
          </Table>
          <Pager base="/admin/audit-logs" query={r.query} hasMore={r.hasMore} />
        </>
      )}
    </Page>
  );
}
