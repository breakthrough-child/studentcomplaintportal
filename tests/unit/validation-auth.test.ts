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
