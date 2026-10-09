import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TRANSITIONS, allowedStaffTransitions, assignArgs, escalateArgs, initialActionState, parseAssign, parseEscalate,
  parseReopen, parseRevoke, parseStatusChange, reopenArgs, revokeArgs, statusArgs,
} from "../../src/lib/staff/actions";
import { COMPLAINT_STATUSES } from "../../src/lib/complaints/student-view";
import { mapRpcError } from "../../src/lib/complaints/rpc-errors";

const ID = "11111111-1111-4111-8111-111111111111";
const LEC = "22222222-2222-4222-8222-222222222222";
const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const rpc = readFileSync(new URL("../../supabase/migrations/20261009000003_rpc.sql", import.meta.url), "utf8");
const fns = readFileSync(new URL("../../supabase/migrations/20261009000002_functions.sql", import.meta.url), "utf8");

function params(name: string): string[] {
  const start = rpc.indexOf(`function public.${name}(`);
  assert.ok(start >= 0, name);
  const sig = rpc.slice(start, rpc.indexOf("returns", start));
  return [...sig.matchAll(/\b(p_\w+)\s/g)].map((m) => m[1] as string).sort();
}

test("the transition table equals the database function", () => {
  const body = fns.slice(fns.indexOf("function public.is_valid_status_transition"), fns.indexOf("$$;", fns.indexOf("function public.is_valid_status_transition") + 400));
  const db: Record<string, string[]> = {};
  for (const m of body.matchAll(/when '(\w+)'\s+then p_new in \(([^)]*)\)/g)) db[m[1] as string] = [...(m[2] as string).matchAll(/'(\w+)'/g)].map((x) => x[1] as string);
  assert.deepEqual(Object.keys(db).sort(), [...COMPLAINT_STATUSES].sort());
  for (const s of COMPLAINT_STATUSES) assert.deepEqual([...TRANSITIONS[s]].sort(), [...(db[s] ?? [])].sort(), s);
});
test("staff are never offered 'reopened' (a student action)", () => {
  for (const s of COMPLAINT_STATUSES) assert.equal(allowedStaffTransitions(s).includes("reopened"), false);
  assert.deepEqual(allowedStaffTransitions("resolved"), ["closed"]);
});
test("status change: only staff statuses, optional bounded reason", () => {
  assert.equal(parseStatusChange(form({ complaintId: ID, newStatus: "resolved" })).success, true);
  for (const bad of ["reopened", "submitted", "deleted", ""]) assert.equal(parseStatusChange(form({ complaintId: ID, newStatus: bad })).success, false, bad);
  assert.equal(parseStatusChange(form({ complaintId: ID, newStatus: "closed", reason: "x".repeat(1001) })).success, false);
  assert.equal(parseStatusChange(form({ complaintId: ID, newStatus: "closed", studentId: ID })).success, true); // extras ignored by the allow-list reader
  const ok = parseStatusChange(form({ complaintId: ID, newStatus: "closed", reason: "  done  " }));
  assert.deepEqual(ok.success && statusArgs(ok.data), { p_complaint_id: ID, p_new_status: "closed", p_reason: "done" });
});
test("escalation needs a reason; restrict is a checkbox", () => {
  assert.equal(parseEscalate(form({ complaintId: ID })).success, false);
  assert.equal(parseEscalate(form({ complaintId: ID, reason: "   " })).success, false);
  const e = parseEscalate(form({ complaintId: ID, reason: "needs triage", restrict: "on" }));
  assert.deepEqual(e.success && escalateArgs(e.data), { p_complaint_id: ID, p_reason: "needs triage", p_restrict: true });
  const n = parseEscalate(form({ complaintId: ID, reason: "needs triage" }));
  assert.equal(n.success && n.data.restrict, false);
});
test("reopen needs a reason", () => {
  assert.equal(parseReopen(form({ complaintId: ID })).success, false);
  const r = parseReopen(form({ complaintId: ID, reason: "still broken" }));
  assert.deepEqual(r.success && reopenArgs(r.data), { p_complaint_id: ID, p_new_status: "reopened", p_reason: "still broken" });
});
test("assign / revoke take uuids only", () => {
  assert.equal(parseAssign(form({ complaintId: ID, lecturerId: "x" })).success, false);
  const a = parseAssign(form({ complaintId: ID, lecturerId: LEC }));
  assert.deepEqual(a.success && assignArgs(a.data), { p_complaint_id: ID, p_lecturer_profile_id: LEC });
  const r = parseRevoke(form({ complaintId: ID, profileId: LEC }));
  assert.deepEqual(r.success && revokeArgs(r.data), { p_complaint_id: ID, p_profile_id: LEC });
});
test("argument names match the migrations", () => {
  assert.deepEqual(Object.keys(statusArgs({ complaintId: ID, newStatus: "closed" })).sort(), params("transition_complaint_status"));
  assert.deepEqual(Object.keys(escalateArgs({ complaintId: ID, reason: "x", restrict: false })).sort(), params("escalate_complaint"));
  assert.deepEqual(Object.keys(assignArgs({ complaintId: ID, lecturerId: LEC })).sort(), params("assign_complaint"));
  assert.deepEqual(Object.keys(revokeArgs({ complaintId: ID, profileId: LEC })).sort(), params("revoke_complaint_access"));
});
test("error mapping for staff and student status actions", () => {
  assert.equal(mapRpcError({ code: "22023", message: "invalid status transition: closed -> resolved" }, "staff").kind, "invalid_transition");
  assert.equal(mapRpcError({ code: "22023", message: "invalid recipient" }, "staff").kind, "invalid_recipient");
  assert.equal(mapRpcError({ code: "22023", message: "a reason (max 1000 characters) is required" }, "staff").kind, "invalid_text");
  assert.equal(mapRpcError({ code: "P0002", message: "complaint not found" }, "staff").kind, "not_found");
  assert.equal(mapRpcError({ code: "42501", message: "x" }, "staff").kind, "not_authorized");
  assert.equal(mapRpcError({ code: "55000", message: "reopen window has passed" }, "student_status").kind, "window_passed");
  assert.equal(initialActionState.ok, false);
});
