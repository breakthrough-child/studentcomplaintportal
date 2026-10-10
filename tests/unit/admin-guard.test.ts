// Static checks that the admin area stays behind SERVER-SIDE authorization. They complement (not
// replace) the database tests, which prove that RLS / RPCs refuse non-administrators on their own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { allowedRolesForPath, homePathForRole, isRoleAllowed, ROLES } from "../../src/lib/auth/roles";
import { resolvePostLoginPath } from "../../src/lib/auth/redirect";

const root = new URL("../../", import.meta.url).pathname;
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) files(rel, out);
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

test("every exported admin data function checks the administrator role first", () => {
  const src = read("src/lib/admin/data.ts");
  const chunks = src.split(/\nexport async function /).slice(1);
  assert.ok(chunks.length >= 20, "found the admin data functions");
  for (const chunk of chunks) {
    const name = chunk.slice(0, chunk.indexOf("("));
    const body = chunk.split(/\nexport /)[0] ?? "";
    assert.match(body, /await requireAdmin\(\)/, `${name} must call requireAdmin()`);
  }
  assert.match(src, /export const requireAdmin = \(\): Promise<Profile> => requireRole\(\["admin"\]\)/);
});

test("the admin layout guards the whole area, and pages / actions never query the database directly", () => {
  assert.match(read("src/app/admin/layout.tsx"), /requireRole\(\["admin"\]\)/);
  for (const f of files("src/app/admin")) {
    const text = read(f);
    assert.doesNotMatch(text, /@\/lib\/supabase\/(server|admin)/, `${f} must go through the guarded functions in src/lib/admin/data.ts`);
  }
  const actions = read("src/app/admin/actions.ts");
  for (const line of actions.split("\n").filter((l) => l.startsWith("export const ") && l.includes("wrap("))) {
    assert.match(line, /wrap\(admin\.\w+,/, `admin action must wrap a guarded admin.* function: ${line}`);
  }
});

test("only administrators may enter /admin; sign-in sends administrators there and nobody else", () => {
  for (const path of ["/admin", "/admin/dashboard", "/admin/registrations", "/admin/users"]) {
    for (const role of ROLES) assert.equal(isRoleAllowed(role, allowedRolesForPath(path) ?? []), role === "admin", `${role} ${path}`);
  }
  assert.equal(homePathForRole("admin"), "/admin/dashboard");
  assert.equal(resolvePostLoginPath("/admin/users", "admin"), "/admin/users");
  assert.equal(resolvePostLoginPath("/admin/users", "student"), "/student/dashboard");
  assert.equal(resolvePostLoginPath("/admin", "main_lecturer"), "/main-lecturer/dashboard");
});
