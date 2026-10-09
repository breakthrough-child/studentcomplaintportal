import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ACCESS_COLUMNS, ATTACHMENT_COLUMNS, EVENT_COLUMNS, HISTORY_COLUMNS, MESSAGE_COLUMNS, STAFF_DETAIL_COLUMNS, STAFF_LIST_COLUMNS, STAFF_PAGE_SIZE,
  buildConversation, buildTimeline, formatBytes, parseAccessGrants, parseAssignable, parseAttachments, parseNameMap, parseOverdue,
  parseScopeCounts, parseStaffDetail, parseStaffList, parseStaffQuery, parseTrend, rollup, staffHref, staffRange, unreadIds,
} from "../../src/lib/staff/view";

const sql = readFileSync(new URL("../../supabase/migrations/20261009000001_schema.sql", import.meta.url), "utf8");
const table = (n: string) => sql.slice(sql.indexOf(`create table public.${n} (`), sql.indexOf("\n);", sql.indexOf(`create table public.${n} (`)));
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const row = {
  id: U(1), reference_number: "CMP-2026-000001", title: "T", status: "submitted", priority: "normal", category_id: U(2), level_id: U(3),
  department_id: U(4), student_id: U(5), is_sensitive: false, requires_triage: false, assigned_lecturer_profile_id: null,
  created_at: "2026-10-01T10:00:00Z", last_activity_at: "2026-10-02T10:00:00Z",
};

test("selected columns exist in the migrations", () => {
  const cols = (s: string) => s.split(",");
  for (const c of cols(STAFF_DETAIL_COLUMNS)) assert.match(table("complaints"), new RegExp(`^\\s+${c}\\s`, "m"), `complaints.${c}`);
  for (const c of cols(MESSAGE_COLUMNS)) assert.match(table("complaint_messages"), new RegExp(`^\\s+${c}\\s`, "m"), `messages.${c}`);
  for (const c of cols(ATTACHMENT_COLUMNS)) assert.match(table("complaint_attachments"), new RegExp(`^\\s+${c}\\s`, "m"), `attachments.${c}`);
  for (const c of cols(HISTORY_COLUMNS)) assert.match(table("complaint_status_history"), new RegExp(`^\\s+${c}\\s`, "m"), `history.${c}`);
  for (const c of cols(EVENT_COLUMNS)) assert.match(table("complaint_events"), new RegExp(`^\\s+${c}\\s`, "m"), `events.${c}`);
  for (const c of cols(ACCESS_COLUMNS)) assert.match(table("complaint_access"), new RegExp(`^\\s+${c}\\s`, "m"), `access.${c}`);
});

test("query defaults, validation and fallbacks", () => {
  const d = parseStaffQuery({});
  assert.deepEqual([d.page, d.view, d.status, d.levelId], [1, "all", undefined, undefined]);
  const q = parseStaffQuery({ page: "2", view: "unread", status: "resolved", levelId: U(3), departmentId: U(4), q: " exam " });
  assert.deepEqual([q.page, q.view, q.status, q.levelId, q.departmentId, q.q], [2, "unread", "resolved", U(3), U(4), "exam"]);
  for (const bad of [{ view: "everything" }, { status: "x" }, { levelId: "200" }, { page: "0" }, { page: "x" }, { q: "a\u0000" }]) {
    const p = parseStaffQuery(bad);
    assert.deepEqual([p.page, p.view, p.status, p.levelId, p.q], [1, "all", undefined, undefined, undefined], JSON.stringify(bad));
  }
});
test("a path segment overrides the query string (level and department pages)", () => {
  const q = parseStaffQuery({ levelId: U(9), departmentId: U(8) }, { levelId: U(3) });
  assert.deepEqual([q.levelId, q.departmentId], [U(3), U(8)]);
  assert.equal(parseStaffQuery({}, { levelId: undefined }).levelId, undefined);
});
test("hrefs keep filters and drop defaults", () => {
  const q = parseStaffQuery({ view: "unread", levelId: U(3), page: "3" });
  assert.equal(staffHref("/lecturer/complaints", q), `/lecturer/complaints?view=unread&levelId=${U(3)}&page=3`);
  assert.equal(staffHref("/lecturer/complaints", q, { page: 1, view: "all", levelId: undefined }), "/lecturer/complaints");
});
test("range asks for one look-ahead row", () => {
  assert.deepEqual(staffRange(2), { from: STAFF_PAGE_SIZE, to: 2 * STAFF_PAGE_SIZE });
});
test("list rows validate; extra columns are dropped; bad rows fail closed", () => {
  const l = parseStaffList([{ ...row, secret: "x" }]);
  assert.equal(l?.[0]?.statusLabel, "Submitted");
  assert.equal(JSON.stringify(l).includes("secret"), false);
  assert.equal(parseStaffList([{ ...row, status: "bogus" }]), null);
  assert.equal(parseStaffList([{ ...row, student_id: null }]), null);
  assert.equal(parseStaffList("x"), null);
});
test("detail parses", () => {
  const d = parseStaffDetail({ ...row, description: "d", resolved_at: null, closed_at: null, target_lecturer_profile_id: U(7) });
  assert.deepEqual([d?.description, d?.targetLecturerId], ["d", U(7)]);
  assert.equal(parseStaffDetail({ ...row }), null);
});
test("unread view is limited to ids the database reported", () => {
  const m = new Map([[U(1), { unread: 2, neverOpened: false }], [U(2), { unread: 0, neverOpened: true }], [U(3), { unread: 0, neverOpened: false }]]);
  assert.deepEqual(unreadIds(m), [U(1), U(2)]);
});
test("name maps", () => {
  assert.equal(parseNameMap([{ id: U(1), name: "A" }])?.get(U(1)), "A");
  assert.equal(parseNameMap([{ id: "x", name: "A" }]), null);
});
test("conversation: ordered, named, with attachments grouped under their message", () => {
  const atts = parseAttachments([
    { id: U(20), message_id: U(11), uploaded_by_profile_id: U(100), original_filename: "a.pdf", mime_type: "application/pdf", file_size: 2048, created_at: "2026-10-02T11:00:00Z" },
    { id: U(21), message_id: null, uploaded_by_profile_id: U(101), original_filename: "b.png", mime_type: "image/png", file_size: 5, created_at: "2026-10-02T11:00:00Z" },
  ], U(100)) ?? [];
  assert.equal(atts[0]?.uploadedByYou, true);
  const msgs = [
    { id: U(12), author_profile_id: U(101), body: "reply", created_at: "2026-10-03T10:00:00Z" },
    { id: U(11), author_profile_id: U(100), body: "hello", created_at: "2026-10-02T10:00:00Z" },
  ];
  const c = buildConversation(msgs, new Map([[U(101), "Dr Who"]]), U(100), U(102), atts);
  assert.deepEqual(c?.map((m) => [m.author, m.fromYou, m.attachments.length]), [["You", true, 1], ["Dr Who", false, 0]]);
  const anon = buildConversation(msgs, new Map(), U(100), U(101), atts);
  assert.equal(anon?.[1]?.author, "Student");
  assert.equal(buildConversation([{ id: "x" }], new Map(), U(1), null, []), null);
});
test("bytes", () => {
  assert.deepEqual([formatBytes(5), formatBytes(2048), formatBytes(10 * 1024 * 1024), formatBytes(-1)], ["5 B", "2.0 KB", "10.0 MB", ""]);
});
test("timeline merges status changes and key events, skipping messages", () => {
  const t = buildTimeline(
    [{ id: U(1), actor_profile_id: null, old_status: null, new_status: "submitted", reason: null, created_at: "2026-10-01T10:00:00Z" },
     { id: U(2), actor_profile_id: U(9), old_status: "submitted", new_status: "under_review", reason: "looking", created_at: "2026-10-02T10:00:00Z" }],
    [{ id: U(3), actor_profile_id: U(9), event_type: "message_posted", metadata: {}, created_at: "2026-10-02T11:00:00Z" },
     { id: U(4), actor_profile_id: U(9), event_type: "escalated", metadata: {}, created_at: "2026-10-03T10:00:00Z" }],
    new Map([[U(9), "Dr Who"]]),
  );
  assert.deepEqual(t?.map((x) => x.text), ["Submitted", "Dr Who changed the status from Submitted to Under review: looking", "Escalated for triage"]);
  assert.equal(buildTimeline([{}], [], new Map()), null);
});
test("access grants only list active ones", () => {
  assert.deepEqual(parseAccessGrants([{ profile_id: U(1), reason: "target", is_active: true }, { profile_id: U(2), reason: "assigned", is_active: false }]), [{ profileId: U(1), reason: "target" }]);
});
test("report roll-ups", () => {
  const rows = parseScopeCounts([
    { level_id: U(1), department_id: U(7), status: "submitted", total: 3 }, { level_id: U(1), department_id: U(8), status: "resolved", total: "2" },
    { level_id: U(2), department_id: U(7), status: "closed", total: 1 },
  ]) ?? [];
  assert.deepEqual(rollup(rows, "levelId"), [{ id: U(1), total: 5, open: 3, resolved: 2 }, { id: U(2), total: 1, open: 0, resolved: 1 }]);
  assert.deepEqual(rollup(rows, "departmentId").map((r) => [r.id, r.total]), [[U(7), 4], [U(8), 2]]);
  assert.equal(parseScopeCounts([{ level_id: "x" }]), null);
  assert.deepEqual(parseTrend([{ day: "2026-10-01", submitted: 1, resolved: "0" }]), [{ day: "2026-10-01", submitted: 1, resolved: 0 }]);
  assert.equal(parseTrend([{ day: "yesterday", submitted: 1, resolved: 0 }]), null);
  const o = parseOverdue([{ complaint_id: U(1), reference_number: "CMP-1", status: "under_review", priority: "high", created_at: "2026-09-01T00:00:00Z", last_activity_at: "2026-09-02T00:00:00Z", days_inactive: 37 }]);
  assert.deepEqual([o?.[0]?.daysInactive, o?.[0]?.statusLabel], [37, "Under review"]);
});
test("assignable lecturers", () => {
  const a = parseAssignable([{ profile_id: U(1), full_name: "Dr A", title: " ", department_name: "Law", scope_labels: ["200 Level / Law"] }]);
  assert.deepEqual(a, [{ id: U(1), name: "Dr A", title: null, department: "Law", scopes: ["200 Level / Law"] }]);
  assert.equal(parseAssignable([{ profile_id: "x" }]), null);
});
