import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COMPLAINT_FORM_FIELDS,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TITLE_MAX,
  TITLE_MIN,
  URGENCY_LEVELS,
  codePointLength,
  echoComplaintValues,
  extractComplaintFields,
  parseSubmitComplaint,
  submitComplaintSchema,
} from "../../src/lib/complaints/schema";
import { fieldErrors } from "../../src/lib/validation/form";

const CATEGORY = "11111111-1111-4111-8111-111111111111";
const LECTURER = "22222222-2222-4222-8222-222222222222";
const LEVEL = "33333333-3333-4333-8333-333333333333";
const DEPT = "44444444-4444-4444-8444-444444444444";

const valid = {
  title: "Exam result recorded incorrectly",
  description: "My score for the second semester examination was recorded wrongly.",
  categoryId: CATEGORY,
  targetLecturerId: LECTURER,
  acknowledgePrivacy: "on",
};

function errorsFor(input: unknown): Record<string, string> {
  const result = submitComplaintSchema.safeParse(input);
  assert.equal(result.success, false, "expected validation to fail");
  return result.success ? {} : fieldErrors(result.error);
}

test("a minimal valid submission parses; urgency defaults to normal; scope stays unset", () => {
  const parsed = submitComplaintSchema.parse(valid);
  assert.equal(parsed.urgency, "normal");
  assert.equal(parsed.levelId, undefined);
  assert.equal(parsed.departmentId, undefined);
  assert.equal(parsed.targetLecturerId, LECTURER);
  assert.equal(parsed.acknowledgePrivacy, true);
});

test("blank optional fields are treated as absent", () => {
  const parsed = submitComplaintSchema.parse({ ...valid, levelId: "", departmentId: "   ", urgency: "" });
  assert.equal(parsed.levelId, undefined);
  assert.equal(parsed.departmentId, undefined);
  assert.equal(parsed.urgency, "normal");
});

test("a chosen level and department are kept, and they are the complaint's own scope", () => {
  const parsed = submitComplaintSchema.parse({ ...valid, levelId: LEVEL, departmentId: DEPT });
  assert.equal(parsed.levelId, LEVEL);
  assert.equal(parsed.departmentId, DEPT);
});

test("title and description are trimmed; CRLF becomes LF; inner newlines survive in the description", () => {
  const parsed = submitComplaintSchema.parse({
    ...valid,
    title: "   Padded title   ",
    description: "  line one\r\nline two\rline three  ",
  });
  assert.equal(parsed.title, "Padded title");
  assert.equal(parsed.description, "line one\nline two\nline three");
});

// ---- length boundaries (counted in code points, like PostgreSQL char_length) ----
const lengthCases: ReadonlyArray<readonly [string, "title" | "description", number, boolean]> = [
  ["title below minimum", "title", TITLE_MIN - 1, false],
  ["title at minimum", "title", TITLE_MIN, true],
  ["title at maximum", "title", TITLE_MAX, true],
  ["title above maximum", "title", TITLE_MAX + 1, false],
  ["description below minimum", "description", DESCRIPTION_MIN - 1, false],
  ["description at minimum", "description", DESCRIPTION_MIN, true],
  ["description at maximum", "description", DESCRIPTION_MAX, true],
  ["description above maximum", "description", DESCRIPTION_MAX + 1, false],
];
for (const [name, field, length, ok] of lengthCases) {
  test(`boundary: ${name} (${length})`, () => {
    const result = submitComplaintSchema.safeParse({ ...valid, [field]: "a".repeat(length) });
    assert.equal(result.success, ok);
  });
}

test("lengths are counted in code points, not UTF-16 units", () => {
  const emoji = "😀";
  assert.equal(emoji.length, 2);
  assert.equal(codePointLength(emoji), 1);
  // 2 emoji = 4 UTF-16 units but only 2 code points: the database would reject it as too short.
  assert.equal(submitComplaintSchema.safeParse({ ...valid, title: emoji.repeat(2) }).success, false);
  assert.equal(submitComplaintSchema.safeParse({ ...valid, title: emoji.repeat(3) }).success, true);
  // 200 emoji = 400 units: still within the 200 code point limit.
  assert.equal(submitComplaintSchema.safeParse({ ...valid, title: emoji.repeat(TITLE_MAX) }).success, true);
  assert.equal(submitComplaintSchema.safeParse({ ...valid, title: emoji.repeat(TITLE_MAX + 1) }).success, false);
});

test("empty and whitespace-only text gets the 'enter a ...' message", () => {
  assert.equal(errorsFor({ ...valid, title: "   " }).title, "Enter a title");
  assert.equal(errorsFor({ ...valid, description: "" }).description, "Enter a description");
  assert.equal(errorsFor({ ...valid, title: undefined }).title, "Enter a title");
  assert.equal(errorsFor({ ...valid, title: null }).title, "Enter a title");
});

test("non-string text is rejected, never coerced", () => {
  for (const bad of [123, true, ["a title"], { a: 1 }]) {
    assert.equal(submitComplaintSchema.safeParse({ ...valid, title: bad }).success, false);
    assert.equal(submitComplaintSchema.safeParse({ ...valid, description: bad }).success, false);
  }
});

test("NUL and control characters are rejected (PostgreSQL cannot store NUL)", () => {
  assert.match(errorsFor({ ...valid, title: "Bad\u0000title" }).title ?? "", /not allowed/);
  assert.match(errorsFor({ ...valid, description: "Valid length text\u0000more" }).description ?? "", /not allowed/);
  assert.match(errorsFor({ ...valid, title: "Bad\u0007title" }).title ?? "", /not allowed/);
  assert.match(errorsFor({ ...valid, description: "Bad\u001btext here, long enough" }).description ?? "", /not allowed/);
  assert.match(errorsFor({ ...valid, title: "Bad\u009ftitle" }).title ?? "", /not allowed/);
});

test("a title is a single line; a description may contain tabs and newlines", () => {
  assert.match(errorsFor({ ...valid, title: "Line one\nline two" }).title ?? "", /not allowed/);
  assert.match(errorsFor({ ...valid, title: "Tab\tseparated" }).title ?? "", /not allowed/);
  assert.equal(submitComplaintSchema.safeParse({ ...valid, description: "Line one\n\tindented line two" }).success, true);
});

test("bidirectional override characters are rejected in both fields", () => {
  assert.match(errorsFor({ ...valid, title: "Total \u202egnirts\u202c reversed" }).title ?? "", /not allowed/);
  assert.match(errorsFor({ ...valid, description: "Looks fine \u2066but is not\u2069 really" }).description ?? "", /not allowed/);
});

test("category and lecturer are required UUIDs with helpful messages", () => {
  assert.equal(errorsFor({ ...valid, categoryId: undefined }).categoryId, "Choose a category");
  assert.equal(errorsFor({ ...valid, categoryId: "" }).categoryId, "Choose a category");
  assert.equal(errorsFor({ ...valid, categoryId: "not-a-uuid" }).categoryId, "Choose a category");
  assert.equal(errorsFor({ ...valid, targetLecturerId: undefined }).targetLecturerId, "Choose the lecturer this complaint is for");
  assert.equal(errorsFor({ ...valid, targetLecturerId: "1" }).targetLecturerId, "Choose the lecturer this complaint is for");
  assert.equal(errorsFor({ ...valid, targetLecturerId: ["x"] }).targetLecturerId, "Choose the lecturer this complaint is for");
  assert.equal(errorsFor({ ...valid, targetLecturerId: `${LECTURER}; drop table complaints` }).targetLecturerId, "Choose the lecturer this complaint is for");
});

test("a malformed level or department is an error (not silently ignored)", () => {
  assert.equal(errorsFor({ ...valid, levelId: "200" }).levelId, "Choose a valid academic level");
  assert.equal(errorsFor({ ...valid, departmentId: "computer science" }).departmentId, "Choose a valid department");
  assert.equal(errorsFor({ ...valid, levelId: 200 }).levelId, "Choose a valid academic level");
});

test("urgency accepts exactly the four database values", () => {
  for (const urgency of URGENCY_LEVELS) {
    assert.equal(submitComplaintSchema.parse({ ...valid, urgency }).urgency, urgency);
  }
  for (const bad of ["critical", "NORMAL", "emergency", "0", "high "]) {
    assert.equal(errorsFor({ ...valid, urgency: bad }).urgency, "Choose a valid urgency", bad);
  }
});

test("the privacy notice must be acknowledged", () => {
  for (const ok of ["on", "true", true]) {
    assert.equal(submitComplaintSchema.safeParse({ ...valid, acknowledgePrivacy: ok }).success, true);
  }
  for (const bad of [undefined, "", "off", "false", false, null, 1, "yes"]) {
    assert.equal(errorsFor({ ...valid, acknowledgePrivacy: bad }).acknowledgePrivacy, "Confirm that you have read the privacy notice", String(bad));
  }
});

// ---- identity and privilege fields supplied by a hostile client ----
const forbiddenFields = [
  "studentId", "student_id", "profileId", "authorId", "userId", "ownerId", "role", "isAdmin",
  "status", "priority", "isSensitive", "is_sensitive", "assignedLecturerId", "assigned_lecturer_profile_id",
  "referenceNumber", "createdAt", "approvalStatus", "targetLecturerProfileId", "p_target_lecturer_profile_id",
];
for (const key of forbiddenFields) {
  test(`schema rejects client-supplied "${key}"`, () => {
    const result = submitComplaintSchema.safeParse({ ...valid, [key]: "x" });
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.error.issues.some((i) => i.code === "unrecognized_keys"));
  });
}

test("the form-data extractor reads only allow-listed fields and ignores the rest", () => {
  const form = new FormData();
  for (const [k, v] of Object.entries(valid)) form.set(k, v);
  form.set("studentId", "99999999-9999-4999-8999-999999999999");
  form.set("role", "admin");
  form.set("status", "resolved");
  form.set("__proto__", "polluted");
  form.set("constructor", "polluted");

  const extracted = extractComplaintFields(form);
  assert.deepEqual(Object.keys(extracted).sort(), [...COMPLAINT_FORM_FIELDS].sort());
  assert.equal(Object.prototype.hasOwnProperty.call(extracted, "studentId"), false);

  const parsed = parseSubmitComplaint(form);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.deepEqual(Object.keys(parsed.data).sort(), [...COMPLAINT_FORM_FIELDS].sort());
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  }
});

test("a file uploaded into a text field is rejected, not stringified", () => {
  const form = new FormData();
  for (const [k, v] of Object.entries(valid)) form.set(k, v);
  form.set("title", new File(["secret"], "title.txt"));
  const parsed = parseSubmitComplaint(form);
  assert.equal(parsed.success, false);
  assert.equal(echoComplaintValues(form).title, "");
});

test("echoed values are strings only and size-capped", () => {
  const form = new FormData();
  form.set("title", "T".repeat(5000));
  form.set("description", "D".repeat(50_000));
  form.set("studentId", "ignored");
  const echoed = echoComplaintValues(form);
  assert.ok(echoed.title.length <= TITLE_MAX + 100);
  assert.ok(echoed.description.length <= DESCRIPTION_MAX + 500);
  assert.equal(echoed.categoryId, "");
  assert.deepEqual(Object.keys(echoed).sort(), [...COMPLAINT_FORM_FIELDS].sort());
});
