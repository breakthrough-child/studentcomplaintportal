import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { SCOPE_TYPES, SETTINGS_COLUMNS, ASSIGNMENT_COLUMNS, describeScope, parseAssignments, parseSettingsRow, parseStaffSettings, settingsUpdate } from "../../src/lib/staff/settings";

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sql = readFileSync(new URL("../../supabase/migrations/20261009000001_schema.sql", import.meta.url), "utf8");

test("settings: title is normalised, blank becomes null, checkbox is boolean", () => {
  const a = parseStaffSettings(form({ title: "  Dr   Jane ", acceptsComplaints: "on" }));
  assert.deepEqual(a.success && settingsUpdate(a.data), { title: "Dr Jane", accepts_complaints: true, email_notifications: false });
  const b = parseStaffSettings(form({ title: "  ", emailNotifications: "on" }));
  assert.deepEqual(b.success && settingsUpdate(b.data), { title: null, accepts_complaints: false, email_notifications: true });
  assert.equal(parseStaffSettings(form({ title: "x".repeat(101) })).success, false);
  assert.equal(parseStaffSettings(form({ title: "a\u0000b" })).success, false);
});
test("a lecturer cannot submit a department or role through the settings form", () => {
  const f = form({ title: "Dr", departmentId: U(1), role: "admin" });
  const r = parseStaffSettings(f);
  assert.equal(r.success && "departmentId" in settingsUpdate(r.data), false);
  assert.deepEqual(r.success && Object.keys(settingsUpdate(r.data)).sort(), ["accepts_complaints", "email_notifications", "title"]);
});
test("columns exist in the migration; scope types equal the enum", () => {
  const t = (n: string) => sql.slice(sql.indexOf(`create table public.${n} (`), sql.indexOf("\n);", sql.indexOf(`create table public.${n} (`)));
  // staff_details gained columns in later migrations (0011 approval, 0015 e-mail preference).
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
  for (const c of SETTINGS_COLUMNS.split(",")) {
    assert.ok(new RegExp(`^\\s+${c}\\s`, "m").test(t("staff_details")) || new RegExp(`alter table public\\.staff_details[^;]*add column ${c}\\b`).test(all), c);
  }
  for (const c of ASSIGNMENT_COLUMNS.split(",")) assert.match(t("lecturer_assignments"), new RegExp(`^\\s+${c}\\s`, "m"), c);
  const m = /create type public\.assignment_scope as enum \(([^)]*)\)/.exec(sql);
  assert.deepEqual([...SCOPE_TYPES].sort(), [...(m?.[1] ?? "").matchAll(/'(\w+)'/g)].map((x) => x[1]).sort());
});
test("settings row and assignment rows validate", () => {
  assert.deepEqual(parseSettingsRow({ title: null, accepts_complaints: true, department_id: null }), { title: "", acceptsComplaints: true, departmentId: null, emailNotifications: true });
  assert.equal(parseSettingsRow({ title: null, accepts_complaints: true, department_id: null, email_notifications: false })?.emailNotifications, false);
  assert.equal(parseSettingsRow({ title: 3 }), null);
  const rows = parseAssignments([{ id: U(1), lecturer_profile_id: U(2), scope_type: "department_level", level_id: U(3), department_id: U(4), is_active: true }]);
  assert.equal(rows?.[0]?.scope, "department_level");
  assert.equal(parseAssignments([{ id: U(1), scope_type: "galaxy" }]), null);
});
test("scope descriptions", () => {
  const lv = new Map([[U(3), "200 Level"]]); const dp = new Map([[U(4), "Law"]]);
  assert.equal(describeScope({ scope: "institution", levelId: null, departmentId: null }, lv, dp), "Entire institution");
  assert.equal(describeScope({ scope: "level", levelId: U(3), departmentId: null }, lv, dp), "200 Level, all departments");
  assert.equal(describeScope({ scope: "department", levelId: null, departmentId: U(4) }, lv, dp), "All levels in Law");
  assert.equal(describeScope({ scope: "department_level", levelId: U(3), departmentId: U(4) }, lv, dp), "200 Level in Law");
  assert.equal(describeScope({ scope: "level", levelId: U(9), departmentId: null }, lv, dp), "a level, all departments");
});
