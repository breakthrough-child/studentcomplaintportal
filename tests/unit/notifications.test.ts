import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCronSecret, parseMailEnv } from "../../src/lib/env/schema";
import { buildNotificationEmail } from "../../src/lib/notifications/message";

const ID = "3f2c1d8e-6a39-4b7e-9d52-0c1b2a3d4e5f";
const base = { kind: "complaint_received" as const, complaintId: ID, reference: "CMP-2026-000042", recipientName: "Dr Jane Doe", siteUrl: "https://portal.example.edu/" };

test("mail settings: not configured, invalid, and valid; secrets never echoed", () => {
  assert.deepEqual(parseMailEnv({}), { ok: false, reason: "SMTP is not configured (SMTP_HOST is empty)" });
  const half = parseMailEnv({ SMTP_HOST: "smtp.example.com", SMTP_FROM: "a@b.co", SMTP_USER: "u", SMTP_PASSWORD: "" });
  assert.equal(half.ok, false);
  const bad = parseMailEnv({ SMTP_HOST: "smtp.example.com", SMTP_FROM: "nope", SMTP_PASSWORD: "hunter2-secret", SMTP_USER: "u" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason.includes("hunter2"), false);
  const gmail = parseMailEnv({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_USER: "x@gmail.com", SMTP_PASSWORD: "abcd efgh ijkl mnop", SMTP_FROM: "Complaints <x@gmail.com>" });
  assert.ok(gmail.ok && gmail.config.secure === true && gmail.config.port === 465);
  const starttls = parseMailEnv({ SMTP_HOST: "mail.bowen.edu.ng", SMTP_FROM: "no-reply@bowen.edu.ng" });
  assert.ok(starttls.ok && starttls.config.secure === false && starttls.config.port === 587 && starttls.config.user === undefined);
  assert.equal(parseMailEnv({ SMTP_HOST: "smtp.example.com\r\nX: y", SMTP_FROM: "a@b.co" }).ok, false, "no header injection via host");
  assert.equal(parseMailEnv({ SMTP_HOST: "smtp.example.com", SMTP_FROM: "A <a@b.co>\r\nBcc: x@y.z" }).ok, false, "no header injection via from");
});

test("cron secret must be long enough, otherwise the endpoint stays disabled", () => {
  assert.equal(parseCronSecret({}), null);
  assert.equal(parseCronSecret({ CRON_SECRET: "short" }), null);
  assert.equal(parseCronSecret({ CRON_SECRET: "x".repeat(24) }), "x".repeat(24));
});

test("e-mails carry only the reference and a sign-in link: no complaint content", () => {
  const e = buildNotificationEmail(base);
  assert.ok(e);
  if (!e) return;
  assert.equal(e.subject, "New complaint CMP-2026-000042 for you");
  assert.ok(e.text.includes(`https://portal.example.edu/lecturer/complaints/${ID}`));
  assert.ok(e.html.includes(`href="https://portal.example.edu/lecturer/complaints/${ID}"`));
  assert.match(e.text, /does not include the complaint itself/);
  const triage = buildNotificationEmail({ ...base, kind: "triage_needed" });
  assert.match(triage?.subject ?? "", /needs triage/);
});

test("e-mail content is escaped and inputs are validated (fail closed)", () => {
  const e = buildNotificationEmail({ ...base, recipientName: "<script>alert(1)</script>\u202eEvil" });
  assert.ok(e && !e.html.includes("<script>") && e.html.includes("&lt;script&gt;"));
  assert.ok(e && !e.text.includes("\u202e"));
  assert.equal(buildNotificationEmail({ ...base, complaintId: "../admin" }), null);
  assert.equal(buildNotificationEmail({ ...base, reference: "CMP-1\r\nBcc: x" }), null);
  assert.equal(buildNotificationEmail({ ...base, siteUrl: "not a url" }), null);
  assert.equal(buildNotificationEmail({ ...base, recipientName: "   " })?.text.startsWith("Dear colleague,"), true);
});
