import { test } from "node:test";
import assert from "node:assert/strict";
import {
  containsPattern, searchColumn,
  COMPLAINT_STATUSES, STATUS_LABELS, STUDENT_PAGE_SIZE, complaintIdSchema, listRange, parseComplaintDetail,
  parseComplaintList, parseListQuery, parseThread, shapeList, DETAIL_COLUMNS, LIST_COLUMNS, MESSAGE_COLUMNS,
} from "../../src/lib/complaints/student-view";
import { readFileSync } from "node:fs";

const ID = "11111111-1111-4111-8111-111111111111";
const ME = "22222222-2222-4222-8222-222222222222";
const STAFF = "33333333-3333-4333-8333-333333333333";
const row = {
  id: ID, reference_number: "SCMS-2026-000001", title: "T", status: "submitted", priority: "normal",
  category_id: ID, created_at: "2026-10-01T10:00:00Z", last_activity_at: "2026-10-01T10:00:00Z",
};
const detail = { ...row, description: "d", is_sensitive: false, resolved_at: null, closed_at: null, category_id: ID, target_lecturer_profile_id: STAFF };

const norm = (q: { page: number; status?: string | undefined }) => ({ page: q.page, status: q.status });

test("query: defaults, valid values, and garbage falling back safely", () => {
  assert.deepEqual(norm(parseListQuery({})), { page: 1, status: undefined });
  assert.deepEqual(norm(parseListQuery(undefined)), { page: 1, status: undefined });
  assert.deepEqual(norm(parseListQuery({ page: "3", status: "resolved" })), { page: 3, status: "resolved" });
  assert.deepEqual(norm(parseListQuery({ page: ["2", "9"], status: ["closed"] })), { page: 2, status: "closed" });
  for (const bad of [{ page: "0" }, { page: "-1" }, { page: "1.5" }, { page: "abc" }, { page: "99999" }, { page: "1e3" }]) {
    assert.equal(parseListQuery(bad).page, 1, JSON.stringify(bad));
  }
  assert.equal(parseListQuery({ status: "hacked" }).status, undefined);
  assert.equal(parseListQuery({ status: "x; drop" }).status, undefined);
});

test("every database status has a label and the enum matches the migration", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261009000001_schema.sql", import.meta.url), "utf8");
  const m = /create type public\.complaint_status as enum\s*\(([^)]*)\)/.exec(sql);
  const declared = [...(m?.[1] ?? "").matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  assert.deepEqual([...COMPLAINT_STATUSES], declared);
  for (const s of COMPLAINT_STATUSES) assert.ok(STATUS_LABELS[s]);
});

test("selected columns exist in the complaints / messages tables", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261009000001_schema.sql", import.meta.url), "utf8");
  const table = (name: string) => sql.slice(sql.indexOf(`create table public.${name} (`), sql.indexOf(");", sql.indexOf(`create table public.${name} (`)));
  for (const c of DETAIL_COLUMNS.split(",")) assert.match(table("complaints"), new RegExp(`^\\s+${c}\\s`, "m"), c);
  for (const c of MESSAGE_COLUMNS.split(",")) assert.match(table("complaint_messages"), new RegExp(`^\\s+${c}\\s`, "m"), c);
  assert.ok(LIST_COLUMNS.split(",").length === 8);
});

test("paging: range is page-based and asks for one look-ahead row", () => {
  assert.deepEqual(listRange(1), { from: 0, to: STUDENT_PAGE_SIZE });
  assert.deepEqual(listRange(3), { from: 2 * STUDENT_PAGE_SIZE, to: 3 * STUDENT_PAGE_SIZE });
});

test("list parsing validates rows and fails closed", () => {
  assert.equal(parseComplaintList([row])?.[0]?.statusLabel, "Submitted");
  assert.equal(parseComplaintList([{ ...row, status: "weird" }]), null);
  assert.equal(parseComplaintList([{ ...row, created_at: "yesterday" }]), null);
  assert.equal(parseComplaintList(null), null);
  assert.deepEqual(parseComplaintList([]), []);
});

test("unknown columns (e.g. student_id, other people's data) are dropped", () => {
  const out = parseComplaintList([{ ...row, student_id: "secret", assigned_lecturer_profile_id: STAFF }]);
  assert.equal(JSON.stringify(out).includes("secret"), false);
  assert.equal(JSON.stringify(out).includes(STAFF), false);
});

test("shapeList: empty vs filtered-empty vs paged", () => {
  const q = parseListQuery({});
  assert.deepEqual(shapeList([], q), { state: "empty", filtered: false });
  assert.deepEqual(shapeList([], parseListQuery({ status: "closed" })), { state: "empty", filtered: true });
  const many = parseComplaintList(Array.from({ length: STUDENT_PAGE_SIZE + 1 }, () => row)) ?? [];
  const r = shapeList(many, q);
  assert.equal(r.state === "ok" && r.items.length, STUDENT_PAGE_SIZE);
  assert.equal(r.state === "ok" && r.hasMore, true);
});

test("detail parsing requires every field; ids must be uuids", () => {
  assert.equal(parseComplaintDetail(detail)?.description, "d");
  assert.equal(parseComplaintDetail({ ...detail, description: undefined }), null);
  assert.equal(parseComplaintDetail(null), null);
  assert.equal(complaintIdSchema.safeParse(ID).success, true);
  for (const bad of ["1", "../etc", `${ID}/x`, "", undefined, ["a"]]) assert.equal(complaintIdSchema.safeParse(bad).success, false);
});

test("thread: ordered, 'you' vs staff, staff identity not exposed", () => {
  const msgs = [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", author_profile_id: STAFF, body: "reply", created_at: "2026-10-02T10:00:00Z" },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", author_profile_id: ME, body: "hello", created_at: "2026-10-01T10:00:00Z" },
  ];
  const t = parseThread(msgs, ME);
  assert.deepEqual(t?.map((m) => [m.body, m.fromYou]), [["hello", true], ["reply", false]]);
  assert.equal(JSON.stringify(t).includes(STAFF), false);
  assert.equal(parseThread([{ id: "x" }], ME), null);
});

test("search and category filters in the query string", () => {
  const q = parseListQuery({ q: "  exam   result ", categoryId: ID });
  assert.deepEqual([q.q, q.categoryId], ["exam result", ID]);
  assert.equal(parseListQuery({ q: "   " }).q, undefined);
  assert.equal(parseListQuery({ q: "a".repeat(101) }).q, undefined); // invalid -> defaults, never an error page
  assert.equal(parseListQuery({ q: "a\u0000b" }).q, undefined);
  assert.equal(parseListQuery({ categoryId: "nope" }).categoryId, undefined);
});
test("LIKE metacharacters in a search are escaped; reference searches target the reference column", () => {
  assert.equal(containsPattern("50%_off\\x"), "%50\\%\\_off\\\\x%");
  assert.equal(containsPattern("a,b)(c"), "%a,b)(c%");
  assert.equal(searchColumn("CMP-2026-000001"), "reference_number");
  assert.equal(searchColumn("cmp-2026"), "reference_number");
  assert.equal(searchColumn("exam"), "title");
});
