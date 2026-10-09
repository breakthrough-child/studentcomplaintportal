import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LECTURER_MAX_PAGE,
  LECTURER_PAGE_SIZE,
  LECTURER_QUERY_MAX,
  buildSearchRpcArgs,
  lecturerLabel,
  lecturerSearchSchema,
  pageResults,
  parseLecturerRows,
  type LecturerOption,
} from "../../src/lib/complaints/lecturers";

const DEPT = "44444444-4444-4444-8444-444444444444";
const LEVEL = "33333333-3333-4333-8333-333333333333";
const PID = "22222222-2222-4222-8222-222222222222";

test("an empty search is valid: no query, no filters, page 1", () => {
  const parsed = lecturerSearchSchema.parse({});
  assert.equal(parsed.query, undefined);
  assert.equal(parsed.page, 1);
  assert.deepEqual(buildSearchRpcArgs(parsed), {
    p_query: null, p_department_id: null, p_level_id: null, p_limit: LECTURER_PAGE_SIZE + 1, p_offset: 0,
  });
});

test("the query is collapsed, trimmed, and blank becomes absent", () => {
  assert.equal(lecturerSearchSchema.parse({ query: "  Jane \n  Doe  " }).query, "Jane Doe");
  assert.equal(lecturerSearchSchema.parse({ query: "   " }).query, undefined);
  assert.equal(lecturerSearchSchema.parse({ query: null }).query, undefined);
});

test("query length is capped in code points", () => {
  assert.equal(lecturerSearchSchema.safeParse({ query: "a".repeat(LECTURER_QUERY_MAX) }).success, true);
  assert.equal(lecturerSearchSchema.safeParse({ query: "a".repeat(LECTURER_QUERY_MAX + 1) }).success, false);
  assert.equal(lecturerSearchSchema.safeParse({ query: "😀".repeat(LECTURER_QUERY_MAX) }).success, true);
});

test("control characters and non-strings are rejected in the query", () => {
  assert.equal(lecturerSearchSchema.safeParse({ query: "a\u0000b" }).success, false);
  assert.equal(lecturerSearchSchema.safeParse({ query: "a\u0007b" }).success, false);
  assert.equal(lecturerSearchSchema.safeParse({ query: 5 }).success, false);
  assert.equal(lecturerSearchSchema.safeParse({ query: ["a"] }).success, false);
});

test("filters are optional UUIDs; any lecturer department/level (100-700 levels are rows, not code) is accepted", () => {
  const parsed = lecturerSearchSchema.parse({ lecturerDepartmentId: DEPT, lecturerLevelId: LEVEL });
  const args = buildSearchRpcArgs(parsed);
  assert.equal(args.p_department_id, DEPT);
  assert.equal(args.p_level_id, LEVEL);
  assert.equal(lecturerSearchSchema.parse({ lecturerDepartmentId: "" }).lecturerDepartmentId, undefined);
  assert.equal(lecturerSearchSchema.safeParse({ lecturerDepartmentId: "cs" }).success, false);
  assert.equal(lecturerSearchSchema.safeParse({ lecturerLevelId: "300" }).success, false);
});

test("unknown keys (including the complaint's own scope and identity fields) are rejected", () => {
  for (const key of ["departmentId", "levelId", "studentId", "role", "limit", "p_limit", "offset"]) {
    assert.equal(lecturerSearchSchema.safeParse({ [key]: "x" }).success, false, key);
  }
});

test("paging maths: offset follows page, one extra row is requested, page range is bounded", () => {
  const page3 = buildSearchRpcArgs(lecturerSearchSchema.parse({ page: 3 }));
  assert.equal(page3.p_offset, 2 * LECTURER_PAGE_SIZE);
  assert.equal(page3.p_limit, LECTURER_PAGE_SIZE + 1);
  assert.equal(lecturerSearchSchema.safeParse({ page: LECTURER_MAX_PAGE }).success, true);
  for (const bad of [0, -1, 1.5, LECTURER_MAX_PAGE + 1, "2", NaN]) {
    assert.equal(lecturerSearchSchema.safeParse({ page: bad }).success, false, String(bad));
  }
  // the database caps p_limit at 50; our request must never exceed that
  assert.ok(LECTURER_PAGE_SIZE + 1 <= 50);
});

const row = {
  profile_id: PID,
  full_name: "Jane Doe",
  title: "Dr",
  home_department_id: DEPT,
  home_department_name: "Computer Science",
  scope_labels: ["Physics / 300 Level", "Law / 700 Level"],
  email: "jane@example.edu",
};

test("rows are minimised: assignments, department id and any extra column never reach the browser", () => {
  const out = parseLecturerRows([row]);
  assert.deepEqual(out, [{ id: PID, name: "Jane Doe", title: "Dr", department: "Computer Science" }]);
  const json = JSON.stringify(out);
  for (const leak of ["scope_labels", "Physics", "700 Level", "email", "jane@", DEPT]) {
    assert.equal(json.includes(leak), false, leak);
  }
});

test("a lecturer from another department is returned like any other (cross-department selection)", () => {
  const out = parseLecturerRows([{ ...row, home_department_name: "Law" }]);
  assert.equal(out?.[0]?.department, "Law");
});

test("blank title/department become null; malformed or non-array responses fail closed", () => {
  assert.deepEqual(parseLecturerRows([{ ...row, title: "  ", home_department_name: null }]), [
    { id: PID, name: "Jane Doe", title: null, department: null },
  ]);
  assert.equal(parseLecturerRows([{ ...row, profile_id: "nope" }]), null);
  assert.equal(parseLecturerRows([{ ...row, full_name: "" }]), null);
  assert.equal(parseLecturerRows([row, { profile_id: PID }]), null);
  assert.equal(parseLecturerRows(null), null);
  assert.equal(parseLecturerRows({ rows: [row] }), null);
  assert.deepEqual(parseLecturerRows([]), []);
});

test("pageResults trims the look-ahead row and reports whether more exist", () => {
  const items = Array.from({ length: LECTURER_PAGE_SIZE + 1 }, (_, i) => i);
  const full = pageResults(items, LECTURER_PAGE_SIZE);
  assert.equal(full.items.length, LECTURER_PAGE_SIZE);
  assert.equal(full.hasMore, true);
  const last = pageResults(items.slice(0, 5), LECTURER_PAGE_SIZE);
  assert.deepEqual([last.items.length, last.hasMore], [5, false]);
  assert.deepEqual(pageResults(items.slice(0, LECTURER_PAGE_SIZE), LECTURER_PAGE_SIZE).hasMore, false);
});

test("lecturerLabel combines title, name and department without doubling the title", () => {
  const mk = (o: Partial<LecturerOption>): LecturerOption => ({ id: PID, name: "Jane Doe", title: "Dr", department: "Law", ...o });
  const sep = " " + String.fromCharCode(0x2014) + " ";
  assert.equal(lecturerLabel(mk({})), "Dr Jane Doe" + sep + "Law");
  assert.equal(lecturerLabel(mk({ name: "Dr Jane Doe" })), "Dr Jane Doe" + sep + "Law");
  assert.equal(lecturerLabel(mk({ title: null, department: null })), "Jane Doe");
});

// ---- static contract check against the real migration (does NOT run the database) ----
const sql = readFileSync(new URL("../../supabase/migrations/20261009000003_rpc.sql", import.meta.url), "utf8");

function signature(name: string): string {
  const start = sql.indexOf(`function public.${name}(`);
  assert.ok(start >= 0, `${name} not found in migration`);
  return sql.slice(start, sql.indexOf("language", start));
}

test("search_lecturers: RPC argument names match the migration exactly", () => {
  const sig = signature("search_lecturers");
  const declared = [...sig.matchAll(/^\s+(p_\w+)\s/gm)].map((m) => m[1]);
  const sent = Object.keys(buildSearchRpcArgs(lecturerSearchSchema.parse({}))).sort();
  assert.deepEqual([...declared].sort(), sent);
});

test("search_lecturers: columns we read exist in the migration's return table", () => {
  const sig = signature("search_lecturers");
  for (const col of ["profile_id", "full_name", "title", "home_department_name"]) {
    assert.match(sig, new RegExp(`\\b${col}\\b`), col);
  }
});

test("the newest migration for search_lecturers no longer returns lecturer assignments", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261009000008_lecturer_selector_minimal.sql", import.meta.url), "utf8");
  const start = sql.indexOf("create or replace function public.search_lecturers(");
  assert.ok(start >= 0);
  const returns = sql.slice(start, sql.indexOf("language", start));
  assert.doesNotMatch(returns, /scope_labels/);
  for (const col of ["profile_id", "full_name", "title", "home_department_name"]) assert.match(returns, new RegExp(`\\b${col}\\b`));
  assert.match(sql, /revoke all on function public\.search_lecturers[\s\S]*from public, anon/);
});
