import { test } from "node:test";
import assert from "node:assert/strict";
import { mapRpcError, type RpcErrorKind } from "../../src/lib/complaints/rpc-errors";

const e = (code: string, message = "") => ({ code, message });

const table: ReadonlyArray<readonly [string, ReturnType<typeof e>, "search" | "submit", RpcErrorKind]> = [
  ["not authorised (search)", e("42501", "not authorized"), "search", "not_authorized"],
  ["not authorised (submit)", e("42501", "not authorized"), "submit", "not_authorized"],
  ["rate limit", e("54000", "rate limit exceeded"), "submit", "rate_limited"],
  ["search input", e("22023", "query too long"), "search", "invalid_input"],
  ["recipient", e("22023", "invalid recipient"), "submit", "invalid_recipient"],
  ["recipient, upper case", e("22023", "INVALID RECIPIENT"), "submit", "invalid_recipient"],
  ["category", e("22023", "invalid category"), "submit", "invalid_category"],
  ["scope", e("22023", "invalid level or department"), "submit", "invalid_scope"],
  ["title", e("22023", "invalid title"), "submit", "invalid_text"],
  ["description", e("22023", "invalid description"), "submit", "invalid_text"],
  ["other 22023", e("22023", "something else"), "submit", "invalid_input"],
  ["not found", e("P0002", "no data"), "submit", "unavailable"],
  ["unique violation", e("23505", "duplicate key value violates unique constraint \"complaints_pkey\""), "submit", "unavailable"],
];
for (const [name, err, ctx, kind] of table) {
  test(`maps ${name} -> ${kind}`, () => assert.equal(mapRpcError(err, ctx).kind, kind));
}

test("unknown, malformed and hostile errors become a generic message and never leak details", () => {
  const hostile = [
    null, undefined, "boom", 42, {}, { code: 42501 }, { code: ["42501"] },
    e("XX000", "relation \"public.complaints\" does not exist; password=hunter2"),
    e("22023", "invalid recipient <script>alert(1)</script> table public.profiles"),
  ];
  for (const err of hostile) {
    const mapped = mapRpcError(err, "submit");
    assert.equal(typeof mapped.message, "string");
    for (const leak of ["public.", "password", "hunter2", "<script>", "relation", "complaints_pkey", "profiles"]) {
      assert.equal(mapped.message.includes(leak), false, `${leak} leaked`);
    }
  }
  assert.equal(mapRpcError(null, "search").kind, "unavailable");
  assert.equal(mapRpcError({ code: 42501 }, "search").kind, "unavailable"); // numeric code is not a SQLSTATE string
});

test("the recipient message does not reveal why the lecturer is ineligible", () => {
  const m = mapRpcError(e("22023", "invalid recipient"), "submit").message;
  assert.doesNotMatch(m, /inactive|suspended|not a lecturer|role|disabled/i);
});
