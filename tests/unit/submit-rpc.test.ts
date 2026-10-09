import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSubmitRpcArgs, parseSubmitResult } from "../../src/lib/complaints/rpc";
import { parseLecturerRows } from "../../src/lib/complaints/lecturers";
import { selectableLevels, type AcademicLevel } from "../../src/lib/complaints/options";
import { mapRpcError } from "../../src/lib/complaints/rpc-errors";
import { parseSubmitComplaint, submitComplaintSchema } from "../../src/lib/complaints/schema";

const CAT = "11111111-1111-4111-8111-111111111111";
const LEC = "22222222-2222-4222-8222-222222222222";
const LEVEL = "33333333-3333-4333-8333-333333333333";
const DEPT = "44444444-4444-4444-8444-444444444444";
const base = {
  title: "Missing coursework mark",
  description: "My coursework mark is missing from the portal.",
  categoryId: CAT,
  targetLecturerId: LEC,
  acknowledgePrivacy: "on",
};

test("arguments use exactly the migration's parameter names and carry no identity", () => {
  const args = buildSubmitRpcArgs(submitComplaintSchema.parse(base));
  const sql = readFileSync(new URL("../../supabase/migrations/20261009000003_rpc.sql", import.meta.url), "utf8");
  const start = sql.indexOf("function public.submit_complaint(");
  assert.ok(start >= 0);
  const sig = sql.slice(start, sql.indexOf("returns table", start));
  const declared = [...sig.matchAll(/^\s+(p_\w+)\s/gm)].map((m) => m[1]);
  assert.deepEqual(Object.keys(args).sort(), [...declared].sort());
  assert.match(sql.slice(start, start + 2500), /new_complaint_id[\s\S]*new_reference_number|v_uid\s+uuid := auth\.uid\(\)/);
  assert.equal(Object.keys(args).some((k) => /student|user|profile_id$|role|owner/.test(k) && k !== "p_target_lecturer_profile_id"), false);
});

test("scope defaults to null (profile values); urgency maps to p_priority", () => {
  const args = buildSubmitRpcArgs(submitComplaintSchema.parse({ ...base, urgency: "urgent" }));
  assert.deepEqual([args.p_level_id, args.p_department_id, args.p_priority], [null, null, "urgent"]);
});

test("cross-department: the complaint's own scope is independent of the lecturer's department", () => {
  // A Law lecturer is selected; the complaint stays in the student's own Physics / 300 Level scope.
  const lecturer = parseLecturerRows([
    { profile_id: LEC, full_name: "Jane Doe", title: "Dr", home_department_id: "55555555-5555-4555-8555-555555555555", home_department_name: "Law", scope_labels: ["Law / 700 Level"] },
  ]);
  assert.equal(lecturer?.[0]?.department, "Law");
  const args = buildSubmitRpcArgs(submitComplaintSchema.parse({ ...base, levelId: LEVEL, departmentId: DEPT }));
  assert.equal(args.p_department_id, DEPT);
  assert.equal(args.p_level_id, LEVEL);
  assert.equal(args.p_target_lecturer_profile_id, LEC);
  assert.equal(JSON.stringify(args).includes("Law"), false);
});

test("levels 100 to 700 can each be chosen as the complaint's level", () => {
  const levels: AcademicLevel[] = [100, 200, 300, 400, 500, 600, 700].map((n, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, name: `${n} Level`, level_number: n, is_active: true,
  }));
  for (const l of selectableLevels(levels)) {
    const args = buildSubmitRpcArgs(submitComplaintSchema.parse({ ...base, levelId: l.id }));
    assert.equal(args.p_level_id, l.id);
  }
});

test("invalid recipients: missing, malformed or smuggled lecturer ids never reach the RPC", () => {
  for (const bad of [undefined, "", "not-a-uuid", `${LEC}'`, ["x"], 7]) {
    assert.equal(submitComplaintSchema.safeParse({ ...base, targetLecturerId: bad }).success, false);
  }
  // A well-formed but ineligible id passes the shape check; the DATABASE rejects it and we map it.
  assert.equal(submitComplaintSchema.safeParse({ ...base, targetLecturerId: "99999999-9999-4999-8999-999999999999" }).success, true);
  assert.equal(mapRpcError({ code: "22023", message: "invalid recipient" }, "submit").kind, "invalid_recipient");
});

test("ownership: student identity fields in the form are rejected, not forwarded", () => {
  const form = new FormData();
  for (const [k, v] of Object.entries(base)) form.set(k, v);
  form.set("studentId", "99999999-9999-4999-8999-999999999999");
  // extractor ignores it entirely, so the parsed input (and the RPC args) cannot contain it
  const parsed = parseSubmitComplaint(form);
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(JSON.stringify(buildSubmitRpcArgs(parsed.data)).includes("9999"), false);
  assert.equal(submitComplaintSchema.safeParse({ ...base, studentId: "x" }).success, false);
});

test("RPC result: exactly one well-formed row, otherwise fail closed", () => {
  const ok = { new_complaint_id: LEC, new_reference_number: "SCMS-2026-000001" };
  assert.deepEqual(parseSubmitResult([ok]), { id: LEC, reference: "SCMS-2026-000001" });
  for (const bad of [null, undefined, [], [ok, ok], [{ ...ok, new_complaint_id: "x" }], [{ new_complaint_id: LEC }], ok, "x"]) {
    assert.equal(parseSubmitResult(bad), null);
  }
});
