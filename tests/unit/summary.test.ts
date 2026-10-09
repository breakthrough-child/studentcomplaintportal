import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeText, parseStatusCounts, parseUnread } from "../../src/lib/complaints/summary";

test("status counts are totalled and grouped", () => {
  const t = parseStatusCounts([
    { status: "submitted", total: 2 }, { status: "reopened", total: "1" }, { status: "under_review", total: 4 },
    { status: "awaiting_student", total: 3 }, { status: "resolved", total: 5 }, { status: "closed", total: 6 },
  ]);
  assert.deepEqual(t && [t.total, t.new, t.inProgress, t.awaitingStudent, t.resolved, t.closed], [21, 3, 4, 3, 5, 6]);
});
test("no rows is a valid zero; bad rows fail closed; duplicates add up", () => {
  assert.equal(parseStatusCounts([])?.total, 0);
  assert.equal(parseStatusCounts([{ status: "bogus", total: 1 }]), null);
  assert.equal(parseStatusCounts([{ status: "closed", total: -1 }]), null);
  assert.equal(parseStatusCounts(null), null);
  assert.equal(parseStatusCounts([{ status: "closed", total: 1 }, { status: "closed", total: 2 }])?.closed, 3);
});
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
test("unread summary counts complaints, not messages", () => {
  const u = parseUnread([
    { complaint_id: A, unread_messages: 5, never_opened: false },
    { complaint_id: B, unread_messages: "0", never_opened: true },
  ]);
  assert.deepEqual(u && [u.withUnreadMessages, u.neverOpened, u.attention], [1, 1, 2]);
  assert.equal(u?.byComplaint.get(A)?.unread, 5);
  assert.equal(parseUnread([{ complaint_id: "x", unread_messages: 1, never_opened: false }]), null);
  assert.equal(parseUnread([])?.attention, 0);
});
test("badge text", () => {
  assert.deepEqual([badgeText(0), badgeText(-3), badgeText(NaN), badgeText(4), badgeText(10)], [null, null, null, "4", "9+"]);
});
