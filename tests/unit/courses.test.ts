import { test } from "node:test";
import assert from "node:assert/strict";
import { adminCourseSchema, courseLabel, courseQuerySchema, courseSearchPattern, newCourseSchema, normaliseCode, parseCourses } from "../../src/lib/courses/schema";

const D = "44444444-4444-4444-8444-444444444444";

test("course codes are normalised like the database does", () => {
  assert.equal(normaliseCode("  csc   301 "), "CSC 301");
  const ok = newCourseSchema.safeParse({ code: "gst111", title: "  Use of   English ", departmentId: "", levelId: undefined });
  assert.ok(ok.success);
  if (ok.success) assert.deepEqual(ok.data, { code: "GST111", title: "Use of English", departmentId: null, levelId: null });
});

test("bad codes, titles and ids are rejected; unknown fields refused", () => {
  for (const code of ["", "x", "<script>", "CSC 301; drop", "A".repeat(21)]) {
    assert.equal(newCourseSchema.safeParse({ code, title: "Title" }).success, false, code);
  }
  assert.equal(newCourseSchema.safeParse({ code: "CSC 301", title: "x" }).success, false);
  assert.equal(newCourseSchema.safeParse({ code: "CSC 301", title: "Ok title", departmentId: "cs" }).success, false);
  assert.equal(newCourseSchema.safeParse({ code: "CSC 301", title: "Ok title", isActive: "on" }).success, false, "lecturers cannot set availability");
  assert.ok(adminCourseSchema.safeParse({ code: "CSC 301", title: "Ok title", departmentId: D, isActive: "on" }).success);
});

test("search: codes match with or without the space; LIKE wildcards are escaped", () => {
  assert.deepEqual(courseSearchPattern("csc301"), { code: "%csc%301%", title: "%csc301%" });
  assert.deepEqual(courseSearchPattern("CSC 301"), { code: "%CSC%301%", title: "%CSC 301%" });
  assert.deepEqual(courseSearchPattern("50%_off"), { code: "%50\\%\\_off%", title: "%50\\%\\_off%" });
  assert.equal(courseSearchPattern("a,b(c)").title.includes(","), false, "PostgREST or() separators are removed");
  assert.equal(courseQuerySchema.safeParse("x".repeat(61)).success, false);
  assert.equal(courseQuerySchema.parse("  data   structures "), "data structures");
});

test("course rows are validated; labels read well", () => {
  const row = { id: D, code: "CSC 301", title: "Data Structures", department_id: null, level_id: null, is_active: true };
  assert.deepEqual(parseCourses([row]), [row]);
  assert.equal(parseCourses([{ ...row, id: "x" }]), null);
  assert.equal(courseLabel(row), "CSC 301 · Data Structures");
});
