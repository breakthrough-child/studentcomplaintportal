// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Notice } from "@/components/auth-card";
import { getCurrentProfile } from "@/lib/auth/guards";
import { homePathForRole } from "@/lib/auth/roles";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const profile = await getCurrentProfile();
  if (profile) redirect(homePathForRole(profile.role));

  // `next` is only passed through; it is validated again on the server after sign-in.
  const next = typeof params.next === "string" ? params.next : "";

  return (
    <AuthCard
      title="Sign in"
      description="Use the school or institutional email address you registered with."
      footer={
        <span className="flex flex-col gap-1">
          <Link href="/forgot-password" className="font-medium text-brand-700 hover:underline">
            Forgot your password?
          </Link>
          <span>
            New here? <Link href="/signup" className="font-medium text-brand-700 hover:underline">Register as a student</Link> or{" "}
            <Link href="/signup?as=lecturer" className="font-medium text-brand-700 hover:underline">as a lecturer</Link>
          </span>
        </span>
      }
    >
      {params.reset === "success" ? <Notice tone="success">Your password was updated. Sign in with the new password.</Notice> : null}
      {params.error === "link" ? <Notice tone="error">That link is invalid or has expired. Request a new one.</Notice> : null}
      <LoginForm next={next} />
    </AuthCard>
  );
}
