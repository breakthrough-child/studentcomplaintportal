// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { listUsers, requireAdmin } from "@/lib/admin/data";
import { AdminForm } from "@/components/admin/admin-form";
import { Empty, LoadError, Page, Pager, SearchBar, Table, INPUT, when } from "@/components/admin/ui";
import { userAction } from "../actions";

export const metadata: Metadata = { title: "Users" };

const FILTERS = [
  { value: "student", label: "Students" }, { value: "lecturer", label: "Lecturers" }, { value: "main_lecturer", label: "Main lecturers" },
  { value: "admin", label: "Administrators" }, { value: "inactive", label: "Deactivated" },
];

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdmin();
  const r = await listUsers(await searchParams);
  return (
    <Page title="Users" intro="Deactivating an account blocks sign-in and all access immediately. You cannot change your own account.">
      <SearchBar base="/admin/users" query={r.query} filters={FILTERS} />
      {!r.ok ? <LoadError /> : r.items.length === 0 ? <Empty>No users match.</Empty> : (
        <>
          <Table label="User accounts" head={["Name", "Email", "Role", "Status", "Created", "Manage"]}>
            {r.items.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">{u.full_name}</td><td className="px-3 py-2">{u.email}</td><td className="px-3 py-2">{u.role.replace("_", " ")}</td>
                <td className="px-3 py-2">{u.is_active ? "Active" : "Deactivated"}</td><td className="px-3 py-2">{when(u.created_at)}</td>
                <td className="px-3 py-2">
                  {u.id === me.id ? <span className="text-slate-500">You</span> : (
                    <AdminForm action={userAction} submit="Save" tone="plain" className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="isActive" defaultChecked={u.is_active} /> Active</label>
                      {u.role === "lecturer" || u.role === "main_lecturer" ? (
                        <select aria-label={`Role for ${u.full_name}`} name="role" defaultValue={u.role} className={INPUT + " !mt-0 w-auto"}>
                          <option value="lecturer">Lecturer</option><option value="main_lecturer">Main lecturer</option>
                        </select>
                      ) : null}
                    </AdminForm>
                  )}
                </td>
              </tr>
            ))}
          </Table>
          <Pager base="/admin/users" query={r.query} hasMore={r.hasMore} />
        </>
      )}
    </Page>
  );
}
