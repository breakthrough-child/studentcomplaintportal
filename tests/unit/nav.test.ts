import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { ROLES, allowedRolesForPath, homePathForRole, isRoleAllowed } from "../../src/lib/auth/roles";
import { NAV_BY_ROLE, activeHref, navForRole } from "../../src/lib/nav/nav";

const pageFile = (href: string) => new URL(`../../src/app${href}/page.tsx`, import.meta.url);

test("every role's home destination is a page that exists (no 404 after login)", () => {
  for (const role of ROLES) {
    const home = homePathForRole(role);
    assert.ok(existsSync(pageFile(home)), `${role} -> ${home} has no page.tsx`);
  }
});

test("every navigation link points at an existing page", () => {
  for (const role of ROLES) {
    for (const item of NAV_BY_ROLE[role]) {
      assert.ok(existsSync(pageFile(item.href)), `${role}: ${item.href} has no page.tsx`);
    }
  }
});

test("a role's menu only links into areas that role may enter", () => {
  for (const role of ROLES) {
    for (const item of navForRole(role)) {
      const allowed = allowedRolesForPath(item.href);
      assert.ok(allowed !== null && isRoleAllowed(role, allowed), `${role} cannot open ${item.href}`);
    }
  }
});

test("menus have unique labels and hrefs", () => {
  for (const role of ROLES) {
    const items = navForRole(role);
    assert.equal(new Set(items.map((i) => i.href)).size, items.length);
    assert.equal(new Set(items.map((i) => i.label)).size, items.length);
  }
});

test("activeHref picks the most specific menu entry", () => {
  const items = navForRole("student");
  assert.equal(activeHref(items, "/student/complaints"), "/student/complaints");
  assert.equal(activeHref(items, "/student/complaints/new"), "/student/complaints/new");
  assert.equal(activeHref(items, "/student/complaints/abc"), "/student/complaints");
  assert.equal(activeHref(items, "/student/dashboard"), "/student/dashboard");
  assert.equal(activeHref(items, "/elsewhere"), null);
});
