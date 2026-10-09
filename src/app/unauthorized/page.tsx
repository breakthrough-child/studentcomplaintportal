// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth-card";

export const metadata: Metadata = { title: "Access denied" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function UnauthorizedPage({ searchParams }: { searchParams: SearchParams }) {
  const { reason } = await searchParams;
  const accountProblem = reason === "account";
  const approvalProblem = reason === "approval";

  return (
    <AuthCard
      title="Access denied"
      description={
        accountProblem
          ? "Your account is not active or has not been set up for this portal. Please contact the university administrator."
          : approvalProblem
            ? "Your student registration has not been approved yet. You can submit complaints once an administrator approves it."
            : "You do not have permission to open that page."
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Back to sign in
        </Link>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </AuthCard>
  );
}
