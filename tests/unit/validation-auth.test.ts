import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  forgotPasswordSchema,
  loginSchema,
  otpLinkTypeSchema,
  resetPasswordSchema,
} from "../../src/lib/validation/auth";
import { fieldErrors } from "../../src/lib/validation/form";
import { parseProfile, usableProfile } from "../../src/lib/auth/profile";

test("login: email is trimmed and lower-cased", () => {
  const parsed = loginSchema.parse({ email: "  Student.One@Uni.Test ", password: "x" });
  assert.equal(parsed.email, "student.one@uni.test");
});

test("login: rejects bad input with field-level messages", () => {
  const result = loginSchema.safeParse({ email: "not-an-email", password: "" });
  assert.equal(result.success, false);
  if (result.success) return;
  const errors = fieldErrors(result.error);
  assert.equal(errors.email, "Enter a valid email address");
  assert.equal(errors.password, "Enter your password");
});

test("login: null (missing form field), arrays and objects are rejected, not coerced", () => {
  for (const bad of [null, undefined, ["a@b.test"], { a: 1 }, 5]) {
    assert.equal(loginSchema.safeParse({ email: bad, password: "x" }).success, false);
    assert.equal(loginSchema.safeParse({ email: "a@b.test", password: bad }).success, false);
  }
});

test("login: absurdly long input is rejected", () => {
  assert.equal(loginSchema.safeParse({ email: `${"a".repeat(400)}@b.test`, password: "x" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "a@b.test", password: "x".repeat(PASSWORD_MAX_LENGTH + 1) }).success, false);
});

test("forgot password: validates and normalises the e-mail", () => {
  assert.equal(forgotPasswordSchema.parse({ email: " A@B.Test " }).email, "a@b.test");
  assert.equal(forgotPasswordSchema.safeParse({ email: "" }).success, false);
});

test("reset password: enforces length and confirmation", () => {
  const ok = "correct horse battery";
  assert.equal(resetPasswordSchema.safeParse({ password: ok, confirmPassword: ok }).success, true);

  const tooShort = "x".repeat(PASSWORD_MIN_LENGTH - 1);
  const short = resetPasswordSchema.safeParse({ password: tooShort, confirmPassword: tooShort });
  assert.equal(short.success, false);

  const mismatch = resetPasswordSchema.safeParse({ password: ok, confirmPassword: `${ok}!` });
  assert.equal(mismatch.success, false);
  if (!mismatch.success) assert.equal(fieldErrors(mismatch.error).confirmPassword, "Passwords do not match");

  assert.equal(
    resetPasswordSchema.safeParse({ password: "x".repeat(PASSWORD_MAX_LENGTH + 1), confirmPassword: "x".repeat(PASSWORD_MAX_LENGTH + 1) }).success,
    false,
  );
});

test("reset password: passwords are never trimmed or altered", () => {
  const withSpaces = "  spaced out pass  ";
  const parsed = resetPasswordSchema.parse({ password: withSpaces, confirmPassword: withSpaces });
  assert.equal(parsed.password, withSpaces);
});

test("otp link types are an allow-list", () => {
  for (const ok of ["invite", "recovery", "signup", "email", "magiclink", "email_change"]) {
    assert.equal(otpLinkTypeSchema.safeParse(ok).success, true);
  }
  for (const bad of ["", "admin", "INVITE", "../x", null, undefined]) {
    assert.equal(otpLinkTypeSchema.safeParse(bad).success, false);
  }
});

const goodRow = {
  id: "3f2c1d8e-6a39-4b7e-9d52-0c1b2a3d4e5f",
  full_name: "Test User",
  email: "t@u.test",
  role: "student",
  is_active: true,
};

test("profile rows are validated at the boundary", () => {
  assert.deepEqual(parseProfile(goodRow), goodRow);
  assert.equal(parseProfile(null), null);
  assert.equal(parseProfile({ ...goodRow, role: "superuser" }), null);
  assert.equal(parseProfile({ ...goodRow, id: "not-a-uuid" }), null);
  assert.equal(parseProfile({ ...goodRow, is_active: "true" }), null);
  assert.equal(parseProfile({ id: goodRow.id }), null);
});

test("an inactive profile is treated like a missing one", () => {
  assert.notEqual(usableProfile(goodRow), null);
  assert.equal(usableProfile({ ...goodRow, is_active: false }), null);
  assert.equal(usableProfile(undefined), null);
});

import { registrationMetadata, registrationSchema } from "../../src/lib/validation/auth";
import { REGISTRATION_REJECTED, parseRegistrationOptions, postRegistrationPath, registrationOutcome } from "../../src/lib/auth/registration";
import { isLecturerRole, needsStaffApproval, parseApprovalState } from "../../src/lib/auth/profile";
import { resolvePostLoginPath } from "../../src/lib/auth/redirect";

const LEVEL = "3f2c1d8e-6a39-4b7e-9d52-0c1b2a3d4e5f";
const DEPT = "9b1d2c3e-4f50-4a6b-8c7d-0e1f2a3b4c5d";
const reg = {
  kind: "student", fullName: "  Ada   Obi ", email: " Ada@Uni.EDU ", personalEmail: "", identifier: " csc/2020/001 ",
  levelId: LEVEL, departmentId: DEPT, password: "correct horse battery", confirmPassword: "correct horse battery",
};

test("registration: open to students without a record; values are normalised; optional fields may be blank", () => {
  const r = registrationSchema.safeParse(reg);
  assert.ok(r.success);
  if (!r.success) return;
  assert.equal(r.data.fullName, "Ada Obi");
  assert.equal(r.data.email, "ada@uni.edu");
  assert.equal(r.data.personalEmail, undefined);
  assert.equal(r.data.identifier, "CSC/2020/001");
  const minimal = registrationSchema.safeParse({ ...reg, identifier: "", personalEmail: undefined });
  assert.ok(minimal.success && minimal.data.identifier === undefined, "registration number is optional");
  assert.ok(registrationSchema.safeParse({ ...reg, kind: "lecturer", identifier: "STF-9" }).success, "lecturers can register too");
});

test("registration: privileged roles cannot be requested and unknown fields are refused", () => {
  for (const kind of ["admin", "main_lecturer", "ADMIN", "", undefined]) {
    assert.equal(registrationSchema.safeParse({ ...reg, kind }).success, false, String(kind));
  }
  assert.equal(registrationSchema.safeParse({ ...reg, role: "admin" }).success, false);
});

test("registration: passwords must match and meet the length rules; they are never altered", () => {
  const mismatch = registrationSchema.safeParse({ ...reg, confirmPassword: "something else entirely" });
  assert.equal(mismatch.success, false);
  if (!mismatch.success) assert.equal(fieldErrors(mismatch.error).confirmPassword, "Passwords do not match");
  assert.equal(registrationSchema.safeParse({ ...reg, password: "short", confirmPassword: "short" }).success, false);
  const spaced = "  spaced out pass  ";
  const ok = registrationSchema.parse({ ...reg, password: spaced, confirmPassword: spaced });
  assert.equal(ok.password, spaced);
});

test("registration: bad names, e-mails and numbers are rejected with field errors", () => {
  const cases: [Record<string, unknown>, string][] = [
    [{ fullName: " " }, "fullName"],
    [{ fullName: "Ada\u202eObi" }, "fullName"],
    [{ email: "not-an-email" }, "email"],
    [{ personalEmail: "nope" }, "personalEmail"],
    [{ personalEmail: "ADA@uni.edu" }, "personalEmail"], // same as the school address
    [{ identifier: "<script>" }, "identifier"],
  ];
  for (const [patch, field] of cases) {
    const r = registrationSchema.safeParse({ ...reg, ...patch });
    assert.equal(r.success, false, JSON.stringify(patch));
    if (!r.success) assert.ok(fieldErrors(r.error)[field], `${field} error for ${JSON.stringify(patch)}`);
  }
});

test("registration metadata carries only the registration fields, never a password or role", () => {
  const meta = registrationMetadata(registrationSchema.parse({ ...reg, personalEmail: "ada@mail.example" }));
  assert.deepEqual(meta, {
    registration_type: "student", full_name: "Ada Obi", personal_email: "ada@mail.example", identifier: "CSC/2020/001",
    level_id: LEVEL, department_id: DEPT,
  });
  assert.deepEqual(Object.keys(registrationMetadata(registrationSchema.parse({ ...reg, identifier: "" }))).sort(),
    ["department_id", "full_name", "level_id", "registration_type"]);
  const lecturer = registrationMetadata(registrationSchema.parse({ ...reg, kind: "lecturer", levelId: LEVEL }));
  assert.equal(lecturer.level_id, undefined, "lecturers never send a level");
  assert.equal(lecturer.department_id, DEPT);
});

test("registration outcome: confirmation e-mail, immediate sign-in, and safe error messages", () => {
  const confirm = registrationOutcome({ hasSession: false, error: null });
  assert.equal(confirm.kind, "confirm_email");
  if (confirm.kind === "confirm_email") assert.match(confirm.message, /approve/i);
  assert.deepEqual(registrationOutcome({ hasSession: true, error: null }), { kind: "signed_in" });
  const weak = registrationOutcome({ hasSession: false, error: { code: "weak_password", status: 422 } });
  assert.ok(weak.kind === "error" && weak.field === "password");
  const db = registrationOutcome({ hasSession: false, error: { code: "unexpected_failure", status: 500 } });
  assert.deepEqual(db, { kind: "error", message: REGISTRATION_REJECTED });
  const limited = registrationOutcome({ hasSession: false, error: { status: 429 } });
  assert.ok(limited.kind === "error" && /too many/i.test(limited.message));
});

test("approval state: lecturers need approval, students and admins are routed elsewhere, unknown fails closed", () => {
  assert.equal(parseApprovalState("pending"), "pending");
  assert.equal(parseApprovalState("superuser"), null);
  assert.equal(parseApprovalState(null), null);
  assert.equal(needsStaffApproval("lecturer", "pending"), true);
  assert.equal(needsStaffApproval("main_lecturer", "rejected"), true);
  assert.equal(needsStaffApproval("lecturer", null), true, "an error is treated as not approved");
  assert.equal(needsStaffApproval("lecturer", "approved"), false);
  assert.equal(needsStaffApproval("student", "pending"), false, "students see their state on the dashboard");
  assert.equal(needsStaffApproval("admin", null), false);
  assert.equal(isLecturerRole("student"), false);
});

test("sign-in never redirects back to the sign-up or pending pages", () => {
  assert.equal(resolvePostLoginPath("/signup", "student"), "/student/dashboard");
  assert.equal(resolvePostLoginPath("/pending", "lecturer"), "/lecturer/dashboard");
});

test("profile rows may carry an avatar path", () => {
  const withAvatar = { ...goodRow, avatar_path: `${goodRow.id}/3f2c1d8e-6a39-4b7e-9d52-0c1b2a3d4e60` };
  assert.deepEqual(parseProfile(withAvatar), withAvatar);
  assert.notEqual(parseProfile({ ...goodRow, avatar_path: null }), null);
  assert.equal(parseProfile({ ...goodRow, avatar_path: 5 }), null);
});

test("after sign-up the destination comes from the actual role and approval, never the form", () => {
  assert.equal(postRegistrationPath("student", "pending"), "/student/dashboard", "students see their status on the dashboard");
  assert.equal(postRegistrationPath("lecturer", "pending"), "/pending");
  assert.equal(postRegistrationPath("lecturer", null), "/pending", "unknown state fails closed");
  assert.equal(postRegistrationPath("lecturer", "approved"), "/lecturer/dashboard");
  assert.equal(postRegistrationPath("main_lecturer", "rejected"), "/pending");
  // Only an invitation can make a sign-up an administrator; then the real role decides.
  assert.equal(postRegistrationPath("admin", "approved"), "/admin/dashboard");
});

test("registration: students must choose a level and department, lecturers a home department", () => {
  const errs = (patch: Record<string, unknown>) => {
    const r = registrationSchema.safeParse({ ...reg, ...patch });
    return r.success ? {} : fieldErrors(r.error);
  };
  assert.equal(errs({ levelId: "" }).levelId, "Choose your level");
  assert.equal(errs({ departmentId: undefined }).departmentId, "Choose your department");
  assert.equal(errs({ departmentId: "not-a-uuid" }).departmentId, "Choose your department");
  assert.equal(errs({ kind: "lecturer", departmentId: "" }).departmentId, "Choose your department");
  assert.ok(registrationSchema.safeParse({ ...reg, kind: "lecturer", levelId: undefined }).success, "lecturers need no level");
});

test("registration options: active levels and departments, malformed data fails closed", () => {
  const o = parseRegistrationOptions([
    { kind: "level", id: LEVEL, name: "100 Level", sort_key: 100 },
    { kind: "department", id: DEPT, name: "Computer Science", sort_key: 0 },
  ]);
  assert.deepEqual(o, { levels: [{ id: LEVEL, name: "100 Level" }], departments: [{ id: DEPT, name: "Computer Science" }] });
  assert.deepEqual(parseRegistrationOptions([]), { levels: [], departments: [] });
  assert.equal(parseRegistrationOptions([{ kind: "profile", id: LEVEL, name: "x", sort_key: 0 }]), null);
  assert.equal(parseRegistrationOptions(null), null);
});
