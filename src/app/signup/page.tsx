import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, Notice } from "@/components/auth-card";
import { getCurrentProfile } from "@/lib/auth/guards";
import { parseRegistrationOptions } from "@/lib/auth/registration";
import { homePathForRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignupPage({ searchParams }: { searchParams: SearchParams }) {
  const profile = await getCurrentProfile();
  if (profile) redirect(homePathForRole(profile.role));
  const params = await searchParams;
  // Active levels and departments: the one database function signed-out visitors may call.
  const { data, error } = await (await createClient()).rpc("registration_options");
  const options = error ? null : parseRegistrationOptions(data);
  return (
    <AuthCard
      title="Create an account"
      description="Students and lecturers can register here. Your account is created straight away and becomes usable once a university administrator approves it."
      footer={<span>Already have an account? <Link href="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link></span>}
    >
      {!options ? (
        <Notice tone="error">Registration is unavailable right now. Please try again later.</Notice>
      ) : options.departments.length === 0 || options.levels.length === 0 ? (
        <Notice tone="info">Registration is not open yet: the university administrator has not set up departments and levels. Please check back later.</Notice>
      ) : (
        <SignupForm initialKind={params.as === "lecturer" ? "lecturer" : "student"} options={options} />
      )}
    </AuthCard>
  );
}
