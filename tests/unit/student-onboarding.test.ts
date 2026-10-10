import { test } from "node:test";
import assert from "node:assert/strict";
import { CLAIM_FAILED, CLAIM_OK, claimOutcome, claimSchema, parseStudentRecord, studentAccess } from "../../src/lib/student/onboarding";

const ID = "11111111-1111-4111-8111-111111111111";
const rec = (s: string) => ({ id: ID, full_name: "A", school_email: "a@u.edu", registration_number: "CSC/2021/001", level_id: ID, department_id: ID, approval_status: s });

test("no linked record -> unlinked, cannot complain, asked to claim", () => {
  const a = studentAccess(null);
  assert.deepEqual([a.state, a.canComplain], ["unlinked", false]);
  assert.match(a.message, /registration number/i);
});
test("only an approved record can complain; others get a specific message", () => {
  for (const s of ["pending", "rejected", "suspended"]) {
    const a = studentAccess(parseStudentRecord(rec(s)));
    assert.equal(a.canComplain, false, s);
    assert.equal(a.state, s);
  }
  assert.equal(studentAccess(parseStudentRecord(rec("approved"))).canComplain, true);
});
test("record parsing rejects unknown statuses and malformed ids", () => {
  assert.equal(parseStudentRecord(rec("vip")), null);
  assert.equal(parseStudentRecord({ ...rec("approved"), id: "x" }), null);
  assert.equal(parseStudentRecord(null), null);
});
test("registration numbers are trimmed, upper-cased and shape-checked like the database", () => {
  assert.equal(claimSchema.parse({ registrationNumber: "  csc/2021/001 " }).registrationNumber, "CSC/2021/001");
  for (const bad of ["", "   ", "a", "-bad", "has space", "x".repeat(41), "semi;colon", "quo'te", "a\u0000b"]) {
    assert.equal(claimSchema.safeParse({ registrationNumber: bad }).success, false, JSON.stringify(bad));
  }
  assert.equal(claimSchema.safeParse({ registrationNumber: "A1", studentId: ID }).success, false);
  assert.equal(claimSchema.safeParse({}).success, false);
});
test("claim outcomes never distinguish failure reasons", () => {
  assert.deepEqual(claimOutcome(true, null), { ok: true, message: CLAIM_OK });
  assert.equal(claimOutcome(false, null).message, CLAIM_FAILED);
  assert.equal(claimOutcome(null, { code: "42501", message: "secret detail" }).message, CLAIM_FAILED);
  assert.equal(claimOutcome("true", null).ok, false);
});

test("a self-registered student record (no number, level or department yet) parses and is pending", () => {
  const selfRegistered = { ...rec("pending"), registration_number: null, level_id: null, department_id: null };
  const parsed = parseStudentRecord(selfRegistered);
  assert.ok(parsed);
  const access = studentAccess(parsed);
  assert.equal(access.state, "pending");
  assert.equal(access.canComplain, false);
  assert.match(access.message, /approval/);
});
