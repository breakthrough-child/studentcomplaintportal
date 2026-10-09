import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPLY_MAX, buildReplyRpcArgs, canStudentReply, echoReplyBody, parseReply, replySchema } from "../../src/lib/complaints/reply";
import { mapRpcError } from "../../src/lib/complaints/rpc-errors";
import { COMPLAINT_STATUSES, parseName } from "../../src/lib/complaints/student-view";

const ID = "11111111-1111-4111-8111-111111111111";
const form = (o: Record<string, string | File>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

test("a valid reply is trimmed and normalised", () => {
  const r = replySchema.parse({ complaintId: ID, body: "  hello\r\nthere  " });
  assert.equal(r.body, "hello\nthere");
});
test("length boundaries (code points)", () => {
  assert.equal(replySchema.safeParse({ complaintId: ID, body: "a" }).success, true);
  assert.equal(replySchema.safeParse({ complaintId: ID, body: "   " }).success, false);
  assert.equal(replySchema.safeParse({ complaintId: ID, body: "a".repeat(REPLY_MAX) }).success, true);
  assert.equal(replySchema.safeParse({ complaintId: ID, body: "a".repeat(REPLY_MAX + 1) }).success, false);
  assert.equal(replySchema.safeParse({ complaintId: ID, body: "😀".repeat(REPLY_MAX) }).success, true);
});
test("NUL, control and bidi characters are rejected; newlines and tabs are fine", () => {
  assert.equal(replySchema.safeParse({ complaintId: ID, body: "a\u0000b" }).success, false);
  assert.equal(replySchema.safeParse({ complaintId: ID, body: "a\u202eb" }).success, false);
  assert.equal(replySchema.safeParse({ complaintId: ID, body: "line\n\tindent" }).success, true);
});
test("the complaint id must be a uuid; identity/extra fields are rejected or ignored", () => {
  for (const bad of ["1", "", undefined, `${ID}x`, ["a"]]) assert.equal(replySchema.safeParse({ complaintId: bad, body: "x" }).success, false);
  assert.equal(replySchema.safeParse({ complaintId: ID, body: "x", authorId: ID }).success, false);
  const parsed = parseReply(form({ complaintId: ID, body: "hi", authorId: ID, studentId: ID, status: "closed" }));
  assert.equal(parsed.success, true);
  if (parsed.success) assert.deepEqual(Object.keys(buildReplyRpcArgs(parsed.data)).sort(), ["p_body", "p_complaint_id"]);
  assert.equal(parseReply(form({ complaintId: ID, body: new File(["x"], "a.txt") })).success, false);
});
test("RPC argument names match post_message in the migration", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261009000003_rpc.sql", import.meta.url), "utf8");
  const m = /function public\.post_message\(([^)]*)\)/.exec(sql);
  const declared = [...(m?.[1] ?? "").matchAll(/\b(p_\w+)\s/g)].map((x) => x[1]).sort();
  assert.deepEqual(declared, Object.keys(buildReplyRpcArgs({ complaintId: ID, body: "x" })).sort());
});
test("only a closed complaint blocks the reply form (the database is the real gate)", () => {
  for (const s of COMPLAINT_STATUSES) assert.equal(canStudentReply(s), s !== "closed", s);
  const sql = readFileSync(new URL("../../supabase/migrations/20261009000003_rpc.sql", import.meta.url), "utf8");
  assert.match(sql, /v_status = 'closed' and v_role = 'student'/);
});
test("reply errors map to fixed messages", () => {
  assert.equal(mapRpcError({ code: "55000", message: "complaint is closed" }, "reply").kind, "closed");
  assert.equal(mapRpcError({ code: "P0002", message: "complaint not found" }, "reply").kind, "not_found");
  assert.equal(mapRpcError({ code: "22023", message: "invalid message" }, "reply").kind, "invalid_input");
  assert.equal(mapRpcError({ code: "54000", message: "x" }, "reply").kind, "rate_limited");
  assert.equal(mapRpcError({ code: "42501", message: "x" }, "reply").kind, "not_authorized");
  // codes only mean these things in the reply context
  assert.equal(mapRpcError({ code: "55000", message: "x" }, "submit").kind, "unavailable");
});
test("echo keeps only a size-capped string", () => {
  assert.equal(echoReplyBody(form({ body: "x".repeat(99999) })).length, REPLY_MAX + 500);
  assert.equal(echoReplyBody(form({ body: new File(["x"], "a") })), "");
});
test("parseName", () => {
  assert.equal(parseName({ name: "Dr Jane" }), "Dr Jane");
  assert.equal(parseName({ name: "" }), null);
  assert.equal(parseName(null), null);
});
