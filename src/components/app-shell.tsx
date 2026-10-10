import Link from "next/link";
import type { Profile } from "@/lib/auth/profile";
import { ROLE_LABELS, homePathForRole } from "@/lib/auth/roles";
import { badgeText } from "@/lib/complaints/summary";
import { getUnread } from "@/lib/complaints/overview-data";
import { navForRole } from "@/lib/nav/nav";
import { avatarUrl } from "@/lib/avatars/data";
import { Avatar } from "./avatar";
import { BrandLink } from "./brand";
import { MobileNav, NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

const COMPLAINTS_HOME = {
  student: "/student/complaints",
  lecturer: "/lecturer/complaints",
  main_lecturer: "/main-lecturer/complaints",
  admin: null,
} as const;

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded-md border border-navy-400 px-3 py-1.5 text-sm font-medium text-snow hover:border-gold-500 hover:text-gold-300"
      >
        Sign out
      </button>
    </form>
  );
}

/**
 * Navy header with a yellow rule (Bowen University colours), role-aware navigation, the unread indicator,
 * the theme switch and sign-out. Below `lg` the navigation collapses into a menu button.
 */
export async function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  // Admins have no complaint-content access by default, so they get no complaint indicator.
  const [unread, picture] = await Promise.all([profile.role === "admin" ? null : getUnread(), avatarUrl(profile.avatar_path)]);
  const badge = unread ? badgeText(unread.attention) : null;
  const target = COMPLAINTS_HOME[profile.role];
  const items = navForRole(profile.role);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative z-30 border-b-4 border-gold-500 bg-navy-700 text-snow shadow-sm dark:bg-navy-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandLink href={homePathForRole(profile.role)} compact />
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {badge && target ? (
              <Link
                href={target}
                className="rounded-full bg-gold-500 px-2.5 py-1 text-xs font-bold text-navy-900 hover:bg-gold-400"
                aria-label={`${unread?.attention} complaints need your attention`}
              >
                {badge}<span className="hidden sm:inline"> need attention</span>
              </Link>
            ) : null}
            <span className="hidden items-center gap-2 md:flex">
              <Avatar name={profile.full_name} url={picture} />
              <span className="max-w-[12rem] leading-tight">
                <span className="block truncate text-sm font-medium">{profile.full_name}</span>
                <span className="block text-xs text-navy-200">{ROLE_LABELS[profile.role]}</span>
              </span>
            </span>
            <ThemeToggle className="text-snow hover:bg-snow/10" />
            <span className="hidden lg:block"><SignOut /></span>
            <MobileNav
              items={items}
              footer={
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-snow">
                    <Avatar name={profile.full_name} url={picture} />
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-sm font-medium">{profile.full_name}</span>
                      <span className="block text-xs text-navy-200">{ROLE_LABELS[profile.role]}</span>
                    </span>
                  </span>
                  <SignOut />
                </div>
              }
            />
          </div>
        </div>
        <div className="mx-auto hidden max-w-6xl px-4 sm:px-6 lg:block">
          <NavLinks items={items} />
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-slate-200 py-4 text-center text-xs text-slate-500">
        Private and confidential · Complaints are visible only to you and the staff authorised to handle them.
      </footer>
    </div>
  );
}
