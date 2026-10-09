// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
"use server";

import { searchLecturers } from "@/lib/complaints/data";
import type { LecturerSearchResult } from "@/lib/complaints/lecturers";

/** Server Action called by the lecturer picker. All checks happen in searchLecturers. */
export async function searchLecturersAction(input: unknown): Promise<LecturerSearchResult> {
  return searchLecturers(input);
}
