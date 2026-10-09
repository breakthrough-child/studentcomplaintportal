import { test } from "node:test";
import assert from "node:assert/strict";
import { isTrustedPost, resolvePostLoginPath, safeRedirectPath } from "../../src/lib/auth/redirect";

test("safeRedirectPath keeps ordinary same-site paths", () => {
  assert.equal(safeRedirectPath("/student/complaints?page=2#top", "/x"), "/student/complaints?page=2#top");
  assert.equal(safeRedirectPath("/", "/x"), "/");
  assert.equal(safeRedirectPath("/a/b%20c", "/x"), "/a/b%20c");
});

const attacks: ReadonlyArray<readonly [string, unknown]> = [
  ["protocol-relative", "//evil.example"],
  ["triple slash", "///evil.example"],
  ["backslash host", "/\\evil.example"],
  ["backslash anywhere", "/ok\\..\\evil"],
  ["absolute https", "https://evil.example/x"],
  ["absolute http", "http://evil.example"],
  ["javascript scheme", "javascript:alert(1)"],
  ["data scheme", "data:text/html,<script>1</script>"],
  ["no leading slash", "evil.example"],
  ["tab smuggling", "/\t/evil.example"],
  ["newline smuggling", "/\n/evil.example"],
  ["CRLF injection", "/ok\r\nSet-Cookie: a=b"],
  ["NUL byte", "/ok\u0000"],
  ["empty", ""],
  ["whitespace only", "   "],
  ["too long", `/${"a".repeat(600)}`],
  ["array", ["/ok"]],
  ["object", { toString: () => "/ok" }],
  ["number", 5],
  ["null", null],
  ["undefined", undefined],
];

for (const [name, value] of attacks) {
  test(`safeRedirectPath rejects ${name}`, () => {
    assert.equal(safeRedirectPath(value, "/fallback"), "/fallback");
  });
}

test("resolvePostLoginPath honours a permitted destination", () => {
  assert.equal(resolvePostLoginPath("/student/complaints/new", "student"), "/student/complaints/new");
  assert.equal(resolvePostLoginPath("/lecturer/levels/1", "main_lecturer"), "/lecturer/levels/1");
});

test("resolvePostLoginPath falls back to the role's dashboard", () => {
  assert.equal(resolvePostLoginPath(undefined, "student"), "/student/dashboard");
  assert.equal(resolvePostLoginPath("//evil.example", "admin"), "/admin/dashboard");
  assert.equal(resolvePostLoginPath("/admin/users", "student"), "/student/dashboard");
  assert.equal(resolvePostLoginPath("/main-lecturer/reports", "lecturer"), "/lecturer/dashboard");
  assert.equal(resolvePostLoginPath("/login", "lecturer"), "/lecturer/dashboard");
  assert.equal(resolvePostLoginPath("/reset-password", "student"), "/student/dashboard");
  assert.equal(resolvePostLoginPath("/auth/callback", "admin"), "/admin/dashboard");
});

const allowed = ["https://portal.example.edu", "https://preview-1.example.edu"];

test("isTrustedPost accepts same-origin requests", () => {
  assert.equal(isTrustedPost({ origin: "https://portal.example.edu", secFetchSite: null }, allowed), true);
  assert.equal(isTrustedPost({ origin: "https://preview-1.example.edu", secFetchSite: undefined }, allowed), true);
  assert.equal(isTrustedPost({ origin: null, secFetchSite: "same-origin" }, allowed), true);
});

test("isTrustedPost rejects cross-site and missing-origin requests", () => {
  assert.equal(isTrustedPost({ origin: "https://evil.example", secFetchSite: "cross-site" }, allowed), false);
  assert.equal(isTrustedPost({ origin: "https://portal.example.edu.evil.example", secFetchSite: null }, allowed), false);
  assert.equal(isTrustedPost({ origin: "null", secFetchSite: null }, allowed), false);
  assert.equal(isTrustedPost({ origin: null, secFetchSite: null }, allowed), false);
  assert.equal(isTrustedPost({ origin: "https://portal.example.edu", secFetchSite: "cross-site" }, []), false);
});
