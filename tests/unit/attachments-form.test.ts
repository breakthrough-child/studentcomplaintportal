import { test } from "node:test";
import assert from "node:assert/strict";
import { BUCKET_LIMIT_BYTES, partialFailureMessage, policyFromSettings, prepareFiles, selectedFiles } from "../../src/lib/attachments/form";
import { DEFAULT_POLICY } from "../../src/lib/attachments/policy";

const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const file = (bytes: Uint8Array, name: string, type: string) => new File([bytes as never], name, { type });

test("policy comes from settings, is capped at the bucket limit, and falls back on garbage", () => {
  assert.equal(policyFromSettings(new Map()).maxFileBytes, DEFAULT_POLICY.maxFileBytes);
  assert.equal(policyFromSettings(new Map([["max_attachment_size_bytes", BUCKET_LIMIT_BYTES * 5]])).maxFileBytes, DEFAULT_POLICY.maxFileBytes);
  assert.equal(policyFromSettings(new Map([["max_attachment_size_bytes", 2048]])).maxFileBytes, 2048);
  assert.equal(policyFromSettings(new Map([["max_attachments_per_submission", "5"]])).maxFiles, DEFAULT_POLICY.maxFiles);
  const p = policyFromSettings(new Map([["allowed_attachment_mime_types", ["image/png", "image/svg+xml", 7]]]));
  assert.deepEqual([...p.allowedMimes], ["image/png"]);
  assert.equal(policyFromSettings(new Map([["allowed_attachment_mime_types", []]])).allowedMimes, DEFAULT_POLICY.allowedMimes);
});
test("an untouched file input (one empty, unnamed file) means no attachments", () => {
  assert.equal(selectedFiles([new File([], "")]).length, 0);
  // Next.js Server Actions turn an untouched file input into an empty file named "undefined".
  assert.equal(selectedFiles([new File([], "undefined", { type: "application/octet-stream" })]).length, 0);
  assert.equal(selectedFiles([new File([], "empty.pdf")]).length, 1, "a chosen empty file is still validated (and rejected)");
  assert.equal(selectedFiles(["text", null, 5]).length, 0);
  assert.equal(selectedFiles([file(png(), "a.png", "image/png")]).length, 1);
});
test("valid files are prepared with the DETECTED type and a sanitised name", async () => {
  const r = await prepareFiles([file(png(), "../scan.png", "image/png")], DEFAULT_POLICY);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual([r.files[0]?.displayName, r.files[0]?.mime], ["scan.png", "image/png"]);
  assert.deepEqual(await prepareFiles([], DEFAULT_POLICY), { ok: true, files: [] });
  assert.deepEqual(await prepareFiles([new File([], "undefined")], DEFAULT_POLICY), { ok: true, files: [] }, "no attachment chosen");
});
test("one bad file rejects the whole request (nothing half-saved)", async () => {
  const exe = new TextEncoder().encode("MZ\x90\x00 pretend executable");
  const r = await prepareFiles([file(png(), "ok.png", "image/png"), file(exe, "evil.png", "image/png")], DEFAULT_POLICY);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors.join(" "), /evil\.png/);
});
test("renamed, spoofed and disallowed files are refused", async () => {
  const cases: Array<[Uint8Array, string, string]> = [
    [png(), "photo.pdf", "application/pdf"],           // PNG bytes under a .pdf name
    [png(), "photo.png", "application/pdf"],           // browser says PDF
    [new TextEncoder().encode("<svg onload=alert(1)>"), "x.svg", "image/svg+xml"],
    [new TextEncoder().encode("#!/bin/sh"), "run.sh", ""],
  ];
  for (const [b, n, t] of cases) assert.equal((await prepareFiles([file(b, n, t)], DEFAULT_POLICY)).ok, false, n);
});
test("count, total size and per-size limits are enforced before reading file contents", async () => {
  const many = Array.from({ length: DEFAULT_POLICY.maxFiles + 1 }, (_, i) => file(png(), `${i}.png`, "image/png"));
  assert.equal((await prepareFiles(many, DEFAULT_POLICY)).ok, false);
  const tight = { ...DEFAULT_POLICY, maxFileBytes: 10 };
  const r = await prepareFiles([file(png(), "big.png", "image/png")], tight);
  assert.ok(!r.ok && /too large/.test(r.errors[0] ?? ""));
  const notAllowed = { ...DEFAULT_POLICY, allowedMimes: new Set(["application/pdf"]) };
  assert.equal((await prepareFiles([file(png(), "a.png", "image/png")], notAllowed)).ok, false);
});
test("partial failure message names the files and never invites a duplicate complaint", () => {
  assert.equal(partialFailureMessage("Done.", []), "Done.");
  assert.match(partialFailureMessage("Done.", ["a.png"]), /this file was not attached: a\.png.*reply/);
  assert.match(partialFailureMessage("Done.", ["a", "b"]), /2 files were not attached/);
});

import { detailPath, parseAttachmentId, parseDeleteAttachment, SIGNED_URL_SECONDS } from "../../src/lib/attachments/download";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
test("download ids must be UUIDs; anything else is just 'not found'", () => {
  assert.equal(parseAttachmentId(A.toUpperCase()), A);
  for (const bad of ["", "1", "../etc/passwd", `${A}/x`, null, undefined, 5, `${A}%00`]) assert.equal(parseAttachmentId(bad), null, String(bad));
  assert.ok(SIGNED_URL_SECONDS <= 120);
});
test("delete requests need two UUIDs and a known area; the refresh path is built from validated parts", () => {
  const ok = parseDeleteAttachment(form({ attachmentId: A, complaintId: B, area: "student" }));
  assert.ok(ok.success);
  if (ok.success) assert.equal(detailPath(ok.data.area, ok.data.complaintId), `/student/complaints/${B}`);
  assert.equal(detailPath("lecturer", B), `/lecturer/complaints/${B}`);
  for (const bad of [{ area: "admin" }, { area: "../../x" }, { attachmentId: "x" }, { complaintId: "" }]) {
    assert.equal(parseDeleteAttachment(form({ attachmentId: A, complaintId: B, area: "student", ...bad })).success, false);
  }
});
