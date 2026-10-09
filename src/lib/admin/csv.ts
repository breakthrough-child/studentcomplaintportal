// Student CSV import parser (pure). Columns: school_email, full_name, registration_number, level, department.
// level and department are matched by name (level also by number) against the live reference data.
import { parseStudentCreate } from "./schemas";

export const CSV_MAX_ROWS = 500;
export const CSV_MAX_BYTES = 256 * 1024;
export const CSV_HEADER = ["school_email", "full_name", "registration_number", "level", "department"] as const;

/** RFC 4180-style parser: quoted fields, doubled quotes, CRLF/LF. Returns null on an unterminated quote. */
export function parseCsv(text: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false, i = 0;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  while (i < src.length) {
    const c = src[i] as string;
    if (inQ) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i += 2; continue; } inQ = false; i += 1; continue; }
      field += c; i += 1; continue;
    }
    if (c === '"' && field === "") { inQ = true; i += 1; continue; }
    if (c === ",") { row.push(field); field = ""; i += 1; continue; }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field); field = ""; rows.push(row); row = []; i += 1; continue;
    }
    field += c; i += 1;
  }
  if (inQ) return null;
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0]?.trim() === ""));
}

export type RefItem = { readonly id: string; readonly name: string; readonly levelNumber?: number };
export type CsvRowResult = { readonly line: number; readonly ok: true; readonly values: { school_email: string; full_name: string; registration_number: string; level_id: string; department_id: string; approval_status: string } }
  | { readonly line: number; readonly ok: false; readonly error: string };
export type CsvImport = { readonly ok: false; readonly error: string } | { readonly ok: true; readonly rows: CsvRowResult[] };

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Validates every row; nothing is written by this function. Duplicate emails/numbers inside the file are rejected. */
export function validateStudentCsv(text: string, levels: readonly RefItem[], departments: readonly RefItem[]): CsvImport {
  if (new TextEncoder().encode(text).length > CSV_MAX_BYTES) return { ok: false, error: "The file is too large (limit 256 KB)" };
  const table = parseCsv(text);
  if (!table) return { ok: false, error: "The file has an unterminated quoted value" };
  const [header, ...body] = table;
  if (!header || header.map(norm).join(",") !== CSV_HEADER.join(",")) return { ok: false, error: `The first row must be exactly: ${CSV_HEADER.join(",")}` };
  if (body.length === 0) return { ok: false, error: "The file has no student rows" };
  if (body.length > CSV_MAX_ROWS) return { ok: false, error: `At most ${CSV_MAX_ROWS} rows per import` };
  const lv = new Map<string, string>(), dp = new Map<string, string>();
  for (const l of levels) { lv.set(norm(l.name), l.id); if (l.levelNumber !== undefined) lv.set(String(l.levelNumber), l.id); }
  for (const d of departments) dp.set(norm(d.name), d.id);
  const seenMail = new Set<string>(), seenReg = new Set<string>();
  const rows = body.map((cells, idx): CsvRowResult => {
    const line = idx + 2;
    if (cells.length !== CSV_HEADER.length) return { line, ok: false, error: `Expected ${CSV_HEADER.length} columns, found ${cells.length}` };
    const [mail = "", name = "", reg = "", level = "", dept = ""] = cells;
    const levelId = lv.get(norm(level)), deptId = dp.get(norm(dept));
    if (!levelId) return { line, ok: false, error: `Unknown level "${level.slice(0, 40)}"` };
    if (!deptId) return { line, ok: false, error: `Unknown department "${dept.slice(0, 40)}"` };
    const p = parseStudentCreate({ get: (k: string) => ({ schoolEmail: mail, fullName: name, registrationNumber: reg, levelId, departmentId: deptId, approvalStatus: "approved" } as Record<string, unknown>)[k] });
    if (!p.success) return { line, ok: false, error: p.error.issues[0]?.message ?? "Invalid row" };
    const v = p.data;
    if (seenMail.has(v.schoolEmail)) return { line, ok: false, error: "Duplicate email in this file" };
    if (seenReg.has(v.registrationNumber)) return { line, ok: false, error: "Duplicate registration number in this file" };
    seenMail.add(v.schoolEmail); seenReg.add(v.registrationNumber);
    return { line, ok: true, values: { school_email: v.schoolEmail, full_name: v.fullName, registration_number: v.registrationNumber, level_id: v.levelId, department_id: v.departmentId, approval_status: v.approvalStatus } };
  });
  return { ok: true, rows };
}
