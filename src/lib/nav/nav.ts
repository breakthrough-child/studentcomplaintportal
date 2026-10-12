// Navigation per role (pure). Links are a convenience only: every page re-checks the role on
// the server and the database decides what rows are visible. tests/unit/nav.test.ts verifies that
// every link here points at a page file that exists, so no role gets a 404 from its own menu.
import type { Role } from "../auth/roles";

export type NavItem = { readonly label: string; readonly href: string };

export const NAV_BY_ROLE: Readonly<Record<Role, readonly NavItem[]>> = {
  student: [
    { label: "Dashboard", href: "/student/dashboard" },
    { label: "My complaints", href: "/student/complaints" },
    { label: "New complaint", href: "/student/complaints/new" },
    { label: "Profile", href: "/student/profile" },
  ],
  lecturer: [
    { label: "Dashboard", href: "/lecturer/dashboard" },
    { label: "Complaints", href: "/lecturer/complaints" },
    { label: "My courses", href: "/lecturer/courses" },
    { label: "Settings", href: "/lecturer/settings" },
  ],
  main_lecturer: [
    { label: "Dashboard", href: "/main-lecturer/dashboard" },
    { label: "Complaints", href: "/main-lecturer/complaints" },
    { label: "Assignments", href: "/main-lecturer/assignments" },
    { label: "Reports", href: "/main-lecturer/reports" },
    { label: "My courses", href: "/lecturer/courses" },
    { label: "Settings", href: "/lecturer/settings" },
  ],
  admin: [
    { label: "Dashboard", href: "/admin/dashboard" },
    { label: "Registrations", href: "/admin/registrations" },
    { label: "Users", href: "/admin/users" },
    { label: "Students", href: "/admin/students" },
    { label: "Lecturers", href: "/admin/lecturers" },
    { label: "Departments", href: "/admin/departments" },
    { label: "Levels", href: "/admin/levels" },
    { label: "Courses", href: "/admin/courses" },
    { label: "Level advisors", href: "/admin/advisors" },
    { label: "Categories", href: "/admin/categories" },
    { label: "Assignments", href: "/admin/assignments" },
    { label: "Audit logs", href: "/admin/audit-logs" },
    { label: "Settings", href: "/admin/settings" },
  ],
};

export function navForRole(role: Role): readonly NavItem[] {
  return NAV_BY_ROLE[role];
}

/** The menu entry that best matches the current path: the longest href equal to it or containing it. */
export function activeHref(items: readonly NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    if ((pathname === href || pathname.startsWith(`${href}/`)) && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
