// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getCurrentProfile } from "@/lib/auth/guards";
import { homePathForRole } from "@/lib/auth/roles";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your student account" };

export default async function SignupPage() {
  const profile = await getCurrentProfile();
  if (profile) redirect(homePathForRole(profile.role));
  return (
    <AuthCard
      title="Create your student account"
      description="Enter the school email and registration number the university has on record. We will email you a link to set your password."
      footer={<span>Already have an account? <Link href="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link>. Lecturers and administrators are invited by an administrator.</span>}
    >
      <SignupForm />
    </AuthCard>
  );
}
