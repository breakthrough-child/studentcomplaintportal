// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth/guards";

// The layout decides which area a user may enter. Every page and Server Action inside re-checks
// the role, and PostgreSQL RLS decides which rows are visible.
export default async function Layout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["main_lecturer"]);
  return <AppShell profile={profile}>{children}</AppShell>;
}
