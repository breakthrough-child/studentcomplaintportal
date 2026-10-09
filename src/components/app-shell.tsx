// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import Link from "next/link";
import type { Profile } from "@/lib/auth/profile";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { badgeText } from "@/lib/complaints/summary";
import { getUnread } from "@/lib/complaints/overview-data";
import { navForRole } from "@/lib/nav/nav";
import { NavLinks } from "./nav-links";

const COMPLAINTS_HOME = {
  student: "/student/complaints",
  lecturer: "/lecturer/complaints",
  main_lecturer: "/main-lecturer/complaints",
  admin: null,
} as const;

/** Header with role-aware navigation, an in-app unread indicator and sign-out. */
export async function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  // Admins have no complaint-content access by default, so they get no complaint indicator.
  const unread = profile.role === "admin" ? null : await getUnread();
  const badge = unread ? badgeText(unread.attention) : null;
  const target = COMPLAINTS_HOME[profile.role];

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="text-sm font-semibold text-brand-700">Student Complaint Portal</Link>
            <NavLinks items={navForRole(profile.role)} />
          </div>
          <div className="flex items-center gap-3 text-sm">
            {badge && target ? (
              <Link href={target} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900" aria-label={`${unread?.attention} complaints need your attention`}>
                {badge} need attention
              </Link>
            ) : null}
            <span className="hidden text-slate-600 sm:inline">{profile.full_name} · {ROLE_LABELS[profile.role]}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
