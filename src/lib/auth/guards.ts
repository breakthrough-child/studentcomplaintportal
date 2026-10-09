// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_COLUMNS, usableProfile, type Profile } from "./profile";
import { isRoleAllowed, type Role } from "./roles";

/** Verified user from the Auth server (never from the unverified cookie). */
export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  return error || !data.user ? null : data.user;
});

/**
 * The caller's own profile, read with their own session so RLS applies. A
 * deactivated account gets no row (the policies require an active profile), and
 * is double-checked here, so it is treated exactly like "not signed in".
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", user.id).maybeSingle();
  if (error) return null;
  return usableProfile(data);
});

/** Requires a signed-in, active user. Signed out -> /login; unusable account -> /unauthorized. */
export async function requireUser(): Promise<Profile> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const profile = await getCurrentProfile();
  if (!profile) redirect("/unauthorized?reason=account");
  return profile;
}

/**
 * Student whose registration the administrator has approved. The decision is made by the
 * database (`is_approved_student()`), the same function RLS and the RPCs use, so this check
 * can never disagree with them. Any error is treated as "not approved" (fail closed).
 */
export async function requireApprovedStudent(): Promise<Profile> {
  const profile = await requireRole(["student"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_approved_student");
  // The dashboard explains the student's state (not linked, pending, rejected, suspended).
  if (error || data !== true) redirect("/student/dashboard");
  return profile;
}

/**
 * Requires one of the given roles. Call this at the top of every protected page,
 * layout, Server Action and route handler. It is not a substitute for RLS: it
 * only decides which area a user may enter, not which rows they may read.
 */
export async function requireRole(allowed: readonly Role[]): Promise<Profile> {
  const profile = await requireUser();
  if (!isRoleAllowed(profile.role, allowed)) redirect("/unauthorized");
  return profile;
}
