import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRIVACY_NOTICE_POINTS,
  academicLevelSchema,
  categorySchema,
  defaultScope,
  departmentSchema,
  parseRows,
  routingNotice,
  selectableCategories,
  selectableDepartments,
  selectableLevels,
  type AcademicLevel,
  type Category,
  type Department,
} from "../../src/lib/complaints/options";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// The seven default levels exactly as seeded by migration 6, deliberately shuffled.
const seeded: AcademicLevel[] = [400, 100, 700, 300, 200, 600, 500].map((n, i) => ({
  id: id(i + 1),
  name: `${n} Level`,
  level_number: n,
  is_active: true,
}));

test("levels 100 through 700 are all offered, in ascending order", () => {
  const levels = selectableLevels(seeded);
  assert.deepEqual(levels.map((l) => l.level_number), [100, 200, 300, 400, 500, 600, 700]);
  assert.deepEqual(levels.map((l) => l.name), ["100 Level", "200 Level", "300 Level", "400 Level", "500 Level", "600 Level", "700 Level"]);
});

test("an administrator-added level appears without any code change; a deactivated one disappears", () => {
  const extra: AcademicLevel = { id: id(90), name: "800 Level", level_number: 800, is_active: true };
  assert.deepEqual(selectableLevels([...seeded, extra]).map((l) => l.level_number).slice(-2), [700, 800]);

  const retired = seeded.map((l) => (l.level_number === 100 ? { ...l, is_active: false } : l));
  assert.deepEqual(selectableLevels(retired).map((l) => l.level_number), [200, 300, 400, 500, 600, 700]);
});

test("selectableLevels does not mutate its input", () => {
  const before = seeded.map((l) => l.level_number);
  selectableLevels(seeded);
  assert.deepEqual(seeded.map((l) => l.level_number), before);
});

test("database rows are validated; any malformed row makes the whole list unusable", () => {
  assert.notEqual(parseRows(academicLevelSchema, seeded), null);
  assert.equal(parseRows(academicLevelSchema, [{ ...seeded[0], level_number: "100" }]), null);
  assert.equal(parseRows(academicLevelSchema, [{ ...seeded[0], id: "nope" }]), null);
  assert.equal(parseRows(academicLevelSchema, [{ id: id(1), name: "x" }]), null);
  assert.equal(parseRows(academicLevelSchema, [{ ...seeded[0], level_number: -100 }]), null);
  assert.equal(parseRows(academicLevelSchema, null), null);
  assert.equal(parseRows(academicLevelSchema, "rows"), null);
  assert.deepEqual(parseRows(academicLevelSchema, []), []);
});

const depts: Department[] = [
  { id: id(11), name: "Physics", code: "PHY", is_active: true },
  { id: id(12), name: "computer Science", code: null, is_active: true },
  { id: id(13), name: "Engineering", code: "ENG", is_active: false },
  { id: id(14), name: "Medicine and Surgery", code: "MBS", is_active: true },
];

test("departments: active only, sorted case-insensitively by name", () => {
  assert.deepEqual(selectableDepartments(depts).map((d) => d.name), ["computer Science", "Medicine and Surgery", "Physics"]);
  assert.notEqual(parseRows(departmentSchema, depts), null);
});

const cats: Category[] = [
  { id: id(21), name: "Academic and examination issues", description: null, is_sensitive: false, is_active: true },
  { id: id(22), name: "Harassment or misconduct", description: "x", is_sensitive: true, is_active: true },
  { id: id(23), name: "Retired category", description: null, is_sensitive: false, is_active: false },
  { id: id(24), name: "Other", description: null, is_sensitive: false, is_active: true },
];

test("categories keep database order, drop inactive ones and keep the sensitivity flag", () => {
  const list = selectableCategories(cats);
  assert.deepEqual(list.map((c) => c.name), ["Academic and examination issues", "Harassment or misconduct", "Other"]);
  assert.equal(list.find((c) => c.name === "Harassment or misconduct")?.is_sensitive, true);
  assert.notEqual(parseRows(categorySchema, cats), null);
});

test("complaint scope defaults to the student's own level and department", () => {
  const levels = selectableLevels(seeded);
  const own = { level_id: seeded[0]?.id ?? "", department_id: id(14) };
  const d = defaultScope(own, levels, selectableDepartments(depts));
  assert.equal(d.levelId, own.level_id);
  assert.equal(d.departmentId, own.department_id);
  assert.equal(d.ownLevelAvailable, true);
  assert.equal(d.ownDepartmentAvailable, true);
});

test("a deactivated own department starts empty so the student must choose a valid one", () => {
  const own = { level_id: seeded[0]?.id ?? "", department_id: id(13) }; // Engineering is inactive
  const d = defaultScope(own, selectableLevels(seeded), selectableDepartments(depts));
  assert.equal(d.departmentId, "");
  assert.equal(d.ownDepartmentAvailable, false);
  assert.equal(d.ownLevelAvailable, true);
});

test("without a student record nothing is pre-filled", () => {
  const d = defaultScope(null, selectableLevels(seeded), selectableDepartments(depts));
  assert.deepEqual([d.levelId, d.departmentId, d.ownLevelAvailable, d.ownDepartmentAvailable], ["", "", false, false]);
});

test("routing notices tell sensitive and ordinary complaints apart", () => {
  assert.match(routingNotice(true), /main lecturer reviews it first/i);
  assert.match(routingNotice(true), /will not see it until it has been released/i);
  assert.match(routingNotice(false), /staff authorised for the level and department/i);
  assert.notEqual(routingNotice(true), routingNotice(false));
});

test("the privacy notice never promises more than the database enforces", () => {
  const text = PRIVACY_NOTICE_POINTS.join(" ");
  assert.match(text, /not shown to other students/i);
  assert.match(text, /administrators cannot read complaints unless/i);
  assert.doesNotMatch(text, /only the lecturer|nobody else|completely anonymous/i);
});
