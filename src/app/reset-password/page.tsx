// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { getSessionUser } from "@/lib/auth/guards";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The reset/invite e-mail link signs the user in via /auth/callback first.
  const user = await getSessionUser();
  if (!user) redirect("/login?error=link");

  return (
    <AuthCard title="Choose a new password" description="You will be asked to sign in again with your new password.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
