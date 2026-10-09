// Pure role and route-access logic (no framework imports).
//
// This is a UX/routing layer. It never replaces authorization: every page and
// action re-checks the role on the server (guards.ts) and PostgreSQL RLS decides
// which rows are visible. A main lecturer may open /lecturer routes, but still
// sees only the complaints the database authorises.

export const ROLES = ["student", "lecturer", "main_lecturer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  student: "Student",
  lecturer: "Lecturer",
  main_lecturer: "Main lecturer",
  admin: "Administrator",
};

export function homePathForRole(role: Role): string {
  switch (role) {
    case "student":
      return "/student/dashboard";
    case "lecturer":
      return "/lecturer/dashboard";
    case "main_lecturer":
      return "/main-lecturer/dashboard";
    case "admin":
      return "/admin/dashboard";
  }
}

export function isRoleAllowed(role: Role, allowed: readonly Role[]): boolean {
  return allowed.includes(role);
}

// First path segment -> roles allowed on that area. Anything not listed is public.
const AREA_ROLES: Readonly<Record<string, readonly Role[]>> = {
  student: ["student"],
  lecturer: ["lecturer", "main_lecturer"],
  "main-lecturer": ["main_lecturer"],
  admin: ["admin"],
};

export function firstSegment(pathname: string): string {
  return pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
}

/** Roles allowed on a path, or null when the path is public. */
export function allowedRolesForPath(pathname: string): readonly Role[] | null {
  const segment = firstSegment(pathname);
  return Object.prototype.hasOwnProperty.call(AREA_ROLES, segment)
    ? (AREA_ROLES[segment] ?? null)
    : null;
}

export function isProtectedPath(pathname: string): boolean {
  return allowedRolesForPath(pathname) !== null;
}
