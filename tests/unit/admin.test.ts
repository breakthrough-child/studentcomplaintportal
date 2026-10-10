import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assignmentRow, invitationRow, levelRow, parseAssignment, parseAssignmentDelete, parseCategory, parseDepartment, parseLevel,
  parseStaffInvite, parseStudentCreate, parseStudentUpdate, parseUserUpdate, studentInsertRow, userUpdateRow, departmentRow,
} from "../../src/lib/admin/schemas";
import { SETTING_DEFS, parseSettingValue, BUCKET_LIMIT_BYTES } from "../../src/lib/admin/settings";
import { parseCsv, validateStudentCsv } from "../../src/lib/admin/csv";
import { adminHref, auditSummary, likeTerm, pageOf, parseAdminList, ADMIN_PAGE_SIZE, userRow, parseList } from "../../src/lib/admin/view";

const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const src = (o: Record<string, unknown>) => ({ get: (k: string) => (k in o ? o[k] : null) });

test("departments: trimmed, optional code/description become null, unknown input rejected", () => {
  const p = parseDepartment(src({ name: "  Computer   Science ", code: " ", isActive: "on" }));
  assert.ok(p.success);
  assert.deepEqual(departmentRow(p.data), { name: "Computer Science", code: null, description: null, is_active: true });
  assert.equal(parseDepartment(src({ name: "" })).success, false);
  assert.equal(parseDepartment(src({ name: "x".repeat(121) })).success, false);
  assert.equal(parseDepartment(src({ name: "a\u0000b" })).success, false);
});
test("levels: whole positive numbers only, 100-700 and others are data not code", () => {
  const p = parseLevel(src({ name: "300 Level", levelNumber: "300" }));
  assert.ok(p.success);
  assert.deepEqual(levelRow(p.data), { name: "300 Level", level_number: 300, is_active: false });
  for (const bad of ["0", "-1", "1.5", "abc", "", "99999"]) assert.equal(parseLevel(src({ name: "x", levelNumber: bad })).success, false, bad);
  assert.equal(parseLevel(src({ name: "Level 800", levelNumber: "800" })).success, true);
});
test("categories: sensitive flag is an explicit checkbox", () => {
  const p = parseCategory(src({ name: "Harassment", isSensitive: "on", isActive: "on" }));
  assert.ok(p.success && p.data.isSensitive && p.data.isActive);
  const q = parseCategory(src({ name: "Fees" }));
  assert.ok(q.success && !q.data.isSensitive);
});
test("students: email lowercased, registration number upper-cased and pattern checked, ids are UUIDs", () => {
  const ok = parseStudentCreate(src({ schoolEmail: " A.B@Uni.EDU ", fullName: "Ada B", registrationNumber: "csc/2020/001", levelId: U1, departmentId: U2, approvalStatus: "approved" }));
  assert.ok(ok.success);
  assert.deepEqual(studentInsertRow(ok.data), { school_email: "a.b@uni.edu", full_name: "Ada B", registration_number: "CSC/2020/001", level_id: U1, department_id: U2, approval_status: "approved" });
  for (const bad of [{ schoolEmail: "nope" }, { registrationNumber: "a b" }, { levelId: "x" }, { approvalStatus: "root" }]) {
    assert.equal(parseStudentCreate(src({ schoolEmail: "a@b.co", fullName: "A", registrationNumber: "AB1", levelId: U1, departmentId: U2, approvalStatus: "pending", ...bad })).success, false);
  }
  assert.equal(parseStudentUpdate(src({ id: U1, levelId: U1, departmentId: U2, approvalStatus: "suspended" })).success, true);
});
test("staff invitations: admin role needs explicit confirmation; admins carry no department or title", () => {
  const base = { email: "X@Uni.edu", fullName: "Dr X", role: "admin", departmentId: U1, title: "Prof" };
  assert.equal(parseStaffInvite(src(base)).success, false);
  const ok = parseStaffInvite(src({ ...base, confirmAdmin: "on" }));
  assert.ok(ok.success);
  assert.deepEqual(invitationRow(ok.data), { email: "x@uni.edu", full_name: "Dr X", role: "admin", department_id: null, title: null });
  const l = parseStaffInvite(src({ ...base, role: "lecturer" }));
  assert.ok(l.success);
  assert.equal(invitationRow(l.data).department_id, U1);
  assert.equal(parseStaffInvite(src({ ...base, role: "student", confirmAdmin: "on" })).success, false);
});
test("user updates: role may only be lecturer or main_lecturer; never admin or student", () => {
  const ok = parseUserUpdate(src({ id: U1, role: "main_lecturer" }));
  assert.ok(ok.success);
  assert.deepEqual(userUpdateRow(ok.data), { is_active: false, role: "main_lecturer" });
  for (const role of ["admin", "student", "root"]) assert.equal(parseUserUpdate(src({ id: U1, role })).success, false, role);
  const none = parseUserUpdate(src({ id: U1, isActive: "on" }));
  assert.ok(none.success);
  assert.deepEqual(userUpdateRow(none.data), { is_active: true });
});
test("assignments: scope shape mirrors the database CHECK and unused ids are dropped", () => {
  assert.equal(parseAssignment(src({ lecturerId: U1, scopeType: "level" })).success, false);
  assert.equal(parseAssignment(src({ lecturerId: U1, scopeType: "department_level", levelId: U1 })).success, false);
  const inst = parseAssignment(src({ lecturerId: U1, scopeType: "institution", levelId: U2, departmentId: U2 }));
  assert.ok(inst.success);
  assert.deepEqual(assignmentRow(inst.data), { lecturer_profile_id: U1, scope_type: "institution", level_id: null, department_id: null });
  const dl = parseAssignment(src({ lecturerId: U1, scopeType: "department_level", levelId: U1, departmentId: U2 }));
  assert.ok(dl.success);
  assert.equal(assignmentRow(dl.data).department_id, U2);
  assert.equal(parseAssignment(src({ lecturerId: U1, scopeType: "galaxy" })).success, false);
});
test("deleting an assignment requires the confirmation box", () => {
  assert.equal(parseAssignmentDelete(src({ id: U1 })).success, false);
  assert.equal(parseAssignmentDelete(src({ id: U1, confirm: "on" })).success, true);
});

test("settings: integers are bounded and the upload size cannot exceed the bucket limit", () => {
  assert.deepEqual(parseSettingValue("complaints_per_hour", "10"), { ok: true, value: 10 });
  assert.equal(parseSettingValue("complaints_per_hour", "0").ok, false);
  assert.equal(parseSettingValue("complaints_per_hour", "1e3").ok, false);
  assert.equal(parseSettingValue("max_attachment_size_bytes", String(BUCKET_LIMIT_BYTES + 1)).ok, false);
  assert.equal(parseSettingValue("max_attachment_size_bytes", String(BUCKET_LIMIT_BYTES)).ok, true);
  assert.equal(parseSettingValue("nope", "1").ok, false);
  assert.deepEqual(parseSettingValue("allow_student_scope_override", null), { ok: true, value: false });
});
test("settings: MIME list only accepts verifiable types; domains are validated and de-duplicated", () => {
  assert.equal(parseSettingValue("allowed_attachment_mime_types", ["image/svg+xml"]).ok, false);
  assert.equal(parseSettingValue("allowed_attachment_mime_types", ["application/x-msdownload"]).ok, false);
  assert.equal(parseSettingValue("allowed_attachment_mime_types", []).ok, false);
  assert.deepEqual(parseSettingValue("allowed_attachment_mime_types", ["image/png", "IMAGE/PNG"]), { ok: true, value: ["image/png"] });
  assert.deepEqual(parseSettingValue("allowed_student_email_domains", "Uni.edu.ng\nuni.edu.ng, other.ac.uk"), { ok: true, value: ["uni.edu.ng", "other.ac.uk"] });
  assert.deepEqual(parseSettingValue("allowed_student_email_domains", ""), { ok: true, value: [] });
  for (const bad of ["not a domain!", "-x.com", "a@b.com", "localhost"]) assert.equal(parseSettingValue("allowed_student_email_domains", bad).ok, false, bad);
  assert.equal(new Set(SETTING_DEFS.map((d) => d.key)).size, SETTING_DEFS.length);
});

const LV = [{ id: U1, name: "300 Level", levelNumber: 300 }];
const DP = [{ id: U2, name: "Computer Science" }];
const HEAD = "school_email,full_name,registration_number,level,department\n";
test("csv: quoted fields, doubled quotes, CRLF and BOM are parsed; unterminated quotes fail", () => {
  assert.deepEqual(parseCsv(String.fromCharCode(0xfeff) + 'a,"b,c","d""e"\r\nx,y,z\n'), [["a", "b,c", 'd"e'], ["x", "y", "z"]]);
  assert.equal(parseCsv('a,"b'), null);
});
test("csv import: valid rows are normalised; level matches by number or name", () => {
  const r = validateStudentCsv(`${HEAD}A@u.edu,Ada,csc/1,300,Computer Science\nb@u.edu,Bob,csc/2,300 level,computer  science\n`, LV, DP);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.rows.every((x) => x.ok), true);
    assert.equal(r.rows[0]?.ok && r.rows[0].values.registration_number, "CSC/1");
    assert.equal(r.rows[0]?.ok && r.rows[0].values.approval_status, "approved");
  }
});
test("csv import: reports row-level errors with line numbers and rejects duplicates", () => {
  const r = validateStudentCsv(`${HEAD}a@u.edu,Ada,CSC1,999,Computer Science\na@u.edu,Ada,CSC2,300,Nope\nok@u.edu,Ok,CSC3,300,Computer Science\nok@u.edu,Ok2,CSC4,300,Computer Science\nx@u.edu,X,CSC3,300,Computer Science\nbad,Y,CSC5,300,Computer Science\nshort,row\n`, LV, DP);
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.rows.map((x) => x.ok), [false, false, true, false, false, false, false]);
    assert.deepEqual(r.rows.map((x) => x.line), [2, 3, 4, 5, 6, 7, 8]);
  }
});
test("csv import: wrong header, empty file and oversized input are refused wholesale", () => {
  assert.equal(validateStudentCsv("a,b\n1,2", LV, DP).ok, false);
  assert.equal(validateStudentCsv(HEAD, LV, DP).ok, false);
  assert.equal(validateStudentCsv(HEAD + "x".repeat(300_000), LV, DP).ok, false);
  const many = HEAD + Array.from({ length: 501 }, (_, i) => `s${i}@u.edu,N,R${i}00,300,Computer Science`).join("\n");
  assert.equal(validateStudentCsv(many, LV, DP).ok, false);
});

test("admin list queries never throw and clamp hostile input", () => {
  assert.deepEqual(parseAdminList({ q: ["a", "b"], page: "3", filter: "role_admin" }), { q: "a", filter: "role_admin", page: 3 });
  assert.deepEqual(parseAdminList({ q: "  ", page: "-4", filter: "DROP TABLE" }), { q: undefined, filter: undefined, page: 1 });
  assert.equal(parseAdminList(null).page, 1);
  assert.equal(parseAdminList({ page: "99999" }).page, 1);
  assert.equal(parseAdminList({ q: "x".repeat(500) }).q?.length, 80);
});
test("search text is escaped for ILIKE and PostgREST filters", () => {
  assert.equal(likeTerm("50%_a\\b"), "%50\\%\\_a\\\\b%");
  assert.equal(likeTerm("a,b(c)"), "%a b c %");
});
test("paging and links", () => {
  const rows = Array.from({ length: ADMIN_PAGE_SIZE + 1 }, (_, i) => i);
  assert.deepEqual([pageOf(rows).items.length, pageOf(rows).hasMore], [ADMIN_PAGE_SIZE, true]);
  assert.equal(adminHref("/admin/users", { q: "ann", filter: undefined, page: 2 }, { page: 3 }), "/admin/users?q=ann&page=3");
  assert.equal(adminHref("/admin/users", { q: undefined, filter: undefined, page: 2 }, { page: 1 }), "/admin/users");
});
test("rows are validated and audit metadata is bounded text", () => {
  const good = { id: U1, full_name: "A", email: "a@b.co", role: "admin", is_active: true, created_at: "2026-01-01T00:00:00Z" };
  assert.equal(parseList(userRow, [good])?.length, 1);
  assert.equal(parseList(userRow, [{ ...good, role: "root" }]), null);
  assert.equal(auditSummary({ a: "x".repeat(1000) }).length, 401);
  assert.equal(auditSummary(undefined), "{}");
  const cyc: Record<string, unknown> = {}; cyc.self = cyc;
  assert.equal(auditSummary(cyc), "{}");
});

import { mapAdminError, mapInviteError } from "../../src/lib/admin/errors";
test("admin errors map to safe messages and never leak provider text", () => {
  assert.match(mapAdminError({ code: "23505", message: "duplicate key value violates unique constraint departments_name_lower_key" }, "department"), /already exists/);
  assert.match(mapAdminError({ code: "23503" }, "level"), /Deactivate/);
  assert.match(mapAdminError({ code: "42501" }, "user"), /permission/);
  assert.match(mapAdminError({ code: "55000" }, "user"), /last administrator/);
  for (const e of [null, "x", { code: 1 }, { code: "XX000", message: "relation public.profiles password=hunter2" }]) {
    const m = mapAdminError(e, "user");
    assert.equal(/public\.|hunter2|relation/.test(m), false);
  }
  assert.match(mapInviteError({ status: 422, message: "A user with this email address has already been registered" }), /already has an account/);
  assert.match(mapInviteError({ status: 429 }), /Too many/);
  assert.equal(/smtp|secret|key/i.test(mapInviteError({ status: 500, message: "SMTP secret key bad" })), false);
});

import { parseReview, reviewArgs, studentUpdateRow } from "../../src/lib/admin/schemas";
import { registrationFilters, registrationRowSchema, staffDetailRow, studentRowSchema } from "../../src/lib/admin/view";

test("students: level and department may stay unset unless the student is approved, and are never cleared", () => {
  const pending = parseStudentUpdate(src({ id: U1, approvalStatus: "rejected" }));
  assert.ok(pending.success);
  if (pending.success) assert.deepEqual(studentUpdateRow(pending.data), { approval_status: "rejected" });
  const approveWithout = parseStudentUpdate(src({ id: U1, levelId: "", approvalStatus: "approved" }));
  assert.equal(approveWithout.success, false);
  const approve = parseStudentUpdate(src({ id: U1, levelId: U1, departmentId: U2, approvalStatus: "approved" }));
  assert.ok(approve.success);
  if (approve.success) assert.deepEqual(studentUpdateRow(approve.data), { approval_status: "approved", level_id: U1, department_id: U2 });
});

test("registration review: only approve / reject, valid ids; optional scope becomes null", () => {
  const ok = parseReview(src({ profileId: U1, decision: "approved", levelId: U1, departmentId: "" }));
  assert.ok(ok.success);
  if (ok.success) assert.deepEqual(reviewArgs(ok.data), { p_profile_id: U1, p_decision: "approved", p_level_id: U1, p_department_id: null });
  for (const bad of [{ decision: "suspended" }, { decision: "admin" }, { profileId: "x" }, { decision: undefined }]) {
    assert.equal(parseReview(src({ profileId: U1, decision: "rejected", ...bad })).success, false, JSON.stringify(bad));
  }
});

test("registration list: filters default to pending, both kinds; rows are validated", () => {
  assert.deepEqual(registrationFilters({}), { status: "pending", kind: null });
  assert.deepEqual(registrationFilters({ status: "all", kind: ["lecturer"] }), { status: "all", kind: "lecturer" });
  assert.deepEqual(registrationFilters({ status: "drop table", kind: "admin" }), { status: "pending", kind: null });
  const row = {
    profile_id: U1, kind: "student", role: "student", full_name: "A", email: "a@u.edu", personal_email: null, identifier: null,
    email_verified: false, is_active: true, approval_status: "pending", level_id: null, department_id: null, created_at: "2026-10-10T10:00:00Z",
  };
  assert.equal(registrationRowSchema.safeParse(row).success, true);
  assert.equal(registrationRowSchema.safeParse({ ...row, kind: "admin" }).success, false);
  assert.equal(studentRowSchema.safeParse({ id: U1, profile_id: U1, school_email: "a@u.edu", full_name: "A", registration_number: null, level_id: null, department_id: null, approval_status: "pending", created_at: "2026-10-10T10:00:00Z" }).success, true);
  assert.equal(staffDetailRow.safeParse({ profile_id: U1, department_id: null, title: null, accepts_complaints: true, approval_status: "pending" }).success, true);
});

import { parseStaffDetails, staffDetailsRow } from "../../src/lib/admin/schemas";
import { parseOverview } from "../../src/lib/admin/view";

test("lecturer details: department optional, title trimmed, approval/role can not be smuggled in", () => {
  const ok = parseStaffDetails(src({ profileId: U1, departmentId: "", title: "  Dr ", acceptsComplaints: "on" }));
  assert.ok(ok.success);
  if (ok.success) assert.deepEqual(staffDetailsRow(ok.data), { department_id: null, title: "Dr", accepts_complaints: true });
  assert.equal(parseStaffDetails(src({ profileId: "x" })).success, false);
  const row = ok.success ? staffDetailsRow(ok.data) : {};
  assert.deepEqual(Object.keys(row).sort(), ["accepts_complaints", "department_id", "title"]);
});

test("admin overview counts: numbers by metric, missing = 0, malformed fails closed", () => {
  const n = parseOverview([{ metric: "students_pending", total: 3 }, { metric: "complaints_total", total: "12" }]);
  assert.ok(n);
  if (!n) return;
  assert.equal(n("students_pending"), 3);
  assert.equal(n("complaints_total"), 12);
  assert.equal(n("complaints_closed"), 0);
  assert.equal(parseOverview([{ metric: "x; drop", total: 1 }]), null);
  assert.equal(parseOverview([{ metric: "a", total: "lots" }]), null);
  assert.equal(parseOverview(null), null);
});
