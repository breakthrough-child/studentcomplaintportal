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
  // "<profile id>/<random uuid>" in the private avatars bucket, or null for the default avatar.
  avatar_path: z.string().nullable().optional(),
});
export type Profile = z.infer<typeof profileSchema>;

export const PROFILE_COLUMNS = "id, full_name, email, role, is_active, avatar_path";

export function parseProfile(row: unknown): Profile | null {
  const result = profileSchema.safeParse(row);
  return result.success ? result.data : null;
}

/** An inactive profile is treated exactly like a missing one. */
export function usableProfile(row: unknown): Profile | null {
  const profile = parseProfile(row);
  return profile !== null && profile.is_active ? profile : null;
}

export const APPROVAL_STATES = ["approved", "pending", "rejected", "suspended", "unlinked"] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

/** Result of my_approval_status(); anything unexpected is treated as "not approved" (fail closed). */
export function parseApprovalState(value: unknown): ApprovalState | null {
  return typeof value === "string" && (APPROVAL_STATES as readonly string[]).includes(value) ? (value as ApprovalState) : null;
}

export function isLecturerRole(role: Profile["role"]): boolean {
  return role === "lecturer" || role === "main_lecturer";
}

/** Lecturer areas need an approved account; students handle their own states on the dashboard. */
export function needsStaffApproval(role: Profile["role"], state: ApprovalState | null): boolean {
  return isLecturerRole(role) && state !== "approved";
}
