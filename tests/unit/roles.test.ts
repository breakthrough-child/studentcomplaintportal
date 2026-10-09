import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  allowedRolesForPath,
  homePathForRole,
  isProtectedPath,
  isRole,
  isRoleAllowed,
  type Role,
} from "../../src/lib/auth/roles";

test("every role has a distinct dashboard path inside its own area", () => {
  const paths = ROLES.map((role) => homePathForRole(role));
  assert.equal(new Set(paths).size, ROLES.length);
  for (const role of ROLES) {
    const allowed = allowedRolesForPath(homePathForRole(role));
    assert.ok(allowed?.includes(role), `${role} must be allowed on its own home path`);
  }
});

test("isRole accepts only the four known roles", () => {
  for (const role of ROLES) assert.equal(isRole(role), true);
  for (const bad of ["Admin", "root", "", null, undefined, 1, {}, "student ", "main-lecturer"]) {
    assert.equal(isRole(bad), false, `isRole(${String(bad)})`);
  }
});

const matrix: ReadonlyArray<readonly [string, readonly Role[] | null]> = [
  ["/student/dashboard", ["student"]],
  ["/student", ["student"]],
  ["/lecturer/complaints/abc", ["lecturer", "main_lecturer"]],
  ["/main-lecturer/reports", ["main_lecturer"]],
  ["/admin/users", ["admin"]],
  ["/ADMIN/users", ["admin"]],
  ["//admin/users", ["admin"]],
  ["/", null],
  ["/login", null],
  ["/forgot-password", null],
  ["/unauthorized", null],
  ["/lecturers", null],
  ["/administrator", null],
  ["/__proto__", null],
  ["/constructor/x", null],
  ["/toString", null],
];

for (const [path, expected] of matrix) {
  test(`route access for ${path}`, () => {
    const actual = allowedRolesForPath(path);
    assert.deepEqual(actual === null ? null : [...actual].sort(), expected === null ? null : [...expected].sort());
    assert.equal(isProtectedPath(path), expected !== null);
  });
}

test("least privilege between areas", () => {
  const can = (role: Role, path: string) => {
    const allowed = allowedRolesForPath(path);
    return allowed === null || isRoleAllowed(role, allowed);
  };
  assert.equal(can("student", "/lecturer/dashboard"), false);
  assert.equal(can("student", "/admin/users"), false);
  assert.equal(can("lecturer", "/main-lecturer/dashboard"), false, "plain lecturers must not open main-lecturer pages");
  assert.equal(can("lecturer", "/admin/users"), false);
  assert.equal(can("admin", "/lecturer/complaints"), false, "admins get no complaint pages by role");
  assert.equal(can("admin", "/student/complaints"), false);
  assert.equal(can("main_lecturer", "/admin/users"), false);
  assert.equal(can("main_lecturer", "/lecturer/complaints"), true);
});
