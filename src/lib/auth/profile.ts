// Runtime validation of the `profiles` row returned by Supabase. Database rows
// are parsed at the boundary instead of trusting a hand-written type.
import { z } from "zod";
import { ROLES } from "./roles";

export const profileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  is_active: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;

export const PROFILE_COLUMNS = "id, full_name, email, role, is_active";

export function parseProfile(row: unknown): Profile | null {
  const result = profileSchema.safeParse(row);
  return result.success ? result.data : null;
}

/** An inactive profile is treated exactly like a missing one. */
export function usableProfile(row: unknown): Profile | null {
  const profile = parseProfile(row);
  return profile !== null && profile.is_active ? profile : null;
}
