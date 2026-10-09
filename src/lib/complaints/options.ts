// Form option lists and routing copy (pure). Academic levels, departments and
// categories come from the database; nothing here hardcodes 100-700 Level, so
// an administrator who adds an 800 Level sees it in the form without a code change.
import { z } from "zod";

const uuid = z.string().uuid();

export const academicLevelSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  level_number: z.number().int().positive(),
  is_active: z.boolean(),
});
export type AcademicLevel = z.infer<typeof academicLevelSchema>;

export const departmentSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  code: z.string().nullable(),
  is_active: z.boolean(),
});
export type Department = z.infer<typeof departmentSchema>;

export const categorySchema = z.object({
  id: uuid,
  name: z.string().min(1),
  description: z.string().nullable(),
  is_sensitive: z.boolean(),
  is_active: z.boolean(),
});
export type Category = z.infer<typeof categorySchema>;

/** The signed-in student's own record (RLS lets a student read only this row). */
export const studentScopeSchema = z.object({ level_id: uuid, department_id: uuid });
export type StudentScope = z.infer<typeof studentScopeSchema>;

/** Rows from the database, validated; null if ANY row is malformed (fail closed). */
export function parseRows<T>(schema: z.ZodType<T>, rows: unknown): T[] | null {
  const result = z.array(schema).safeParse(rows);
  return result.success ? result.data : null;
}

export function selectableLevels(rows: readonly AcademicLevel[]): AcademicLevel[] {
  return rows.filter((r) => r.is_active).sort((a, b) => a.level_number - b.level_number);
}

export function selectableDepartments(rows: readonly Department[]): Department[] {
  return rows
    .filter((r) => r.is_active)
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

/** Keeps database order (the seeded order ends with "Other"); only drops inactive rows. */
export function selectableCategories(rows: readonly Category[]): Category[] {
  return rows.filter((r) => r.is_active);
}

export type ScopeDefaults = {
  /** "" when the student's own value is not selectable (e.g. the department was deactivated). */
  readonly levelId: string;
  readonly departmentId: string;
  readonly ownLevelAvailable: boolean;
  readonly ownDepartmentAvailable: boolean;
};

/**
 * Pre-fills the complaint's level/department from the student's own profile.
 * If the profile value is no longer selectable the field starts empty and the
 * form makes the student choose, instead of submitting a value the database
 * would reject.
 */
export function defaultScope(
  own: StudentScope | null,
  levels: readonly AcademicLevel[],
  departments: readonly Department[],
): ScopeDefaults {
  const ownLevelAvailable = own !== null && levels.some((l) => l.id === own.level_id);
  const ownDepartmentAvailable = own !== null && departments.some((d) => d.id === own.department_id);
  return {
    levelId: ownLevelAvailable && own ? own.level_id : "",
    departmentId: ownDepartmentAvailable && own ? own.department_id : "",
    ownLevelAvailable,
    ownDepartmentAvailable,
  };
}

/** Who can read a complaint, in plain words, matching the database policies. */
export function routingNotice(isSensitive: boolean): string {
  return isSensitive
    ? "This category is handled confidentially. A main lecturer reviews it first. The lecturer you choose will not see it until it has been released to them."
    : "Only you, the lecturer you choose, and staff authorised for the level and department of this complaint can read it.";
}

export const PRIVACY_NOTICE_POINTS: readonly string[] = [
  "Your complaint and the messages in it are private. They are not shown to other students.",
  "Staff who can read it will see your name and your student record details.",
  "Administrators cannot read complaints unless they have been explicitly granted access to them.",
  "Do not include passwords or other people's private information.",
];
