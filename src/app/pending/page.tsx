import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard, Notice } from "@/components/auth-card";
import { getApprovalState, requireUser } from "@/lib/auth/guards";
import { needsStaffApproval } from "@/lib/auth/profile";
import { homePathForRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Account awaiting approval" };

const MESSAGES = {
  pending: "Your lecturer account has been created and is waiting for a university administrator to approve it. You will be able to see and handle complaints once it is approved.",
  rejected: "Your lecturer registration was not approved. If you think this is a mistake, contact the university administrator.",
  suspended: "Your lecturer access is suspended. Please contact the university administrator.",
} as const;

/**
 * Where a signed-in lecturer without approval lands (requireRole sends them here). It shows only their
 * own state. The database grants such an account no staff privileges, whatever happens on this page.
 */
export default async function PendingPage() {
  const profile = await requireUser();
  const state = await getApprovalState();
  if (!needsStaffApproval(profile.role, state)) redirect(homePathForRole(profile.role));
  const message = state === "rejected" || state === "suspended" ? MESSAGES[state] : MESSAGES.pending;
  return (
    <AuthCard
      title={state === "rejected" ? "Registration not approved" : state === "suspended" ? "Access suspended" : "Awaiting approval"}
      description={`Signed in as ${profile.email}.`}
    >
      <Notice tone={state === "pending" || state === null ? "info" : "error"}>{message}</Notice>
      <form action="/auth/signout" method="post">
        <button type="submit" className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">Sign out</button>
      </form>
    </AuthCard>
  );
}
