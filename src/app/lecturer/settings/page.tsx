// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { getMySettings } from "@/lib/staff/data";
import { ProfilePicture } from "@/components/profile-picture";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function LecturerSettings() {
  const [profile, s] = await Promise.all([requireRole(["lecturer", "main_lecturer"]), getMySettings()]); // both enforce the staff role
  if (!s.ok) return <main id="main" className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8"><p role="alert" className="text-red-700">Your settings could not be loaded. Please try again in a moment.</p></main>;
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="border-l-4 border-gold-500 pl-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Settings</h1>
      <ProfilePicture profile={profile} />
      <SettingsForm title={s.title} acceptsComplaints={s.acceptsComplaints} />
      <section aria-labelledby="scope" className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
        <h2 id="scope" className="font-medium">Your authorised scope</h2>
        <p className="mt-1 text-sm text-slate-600">Set by an administrator. {s.departmentName ? `Home department: ${s.departmentName}.` : ""}</p>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {s.scopes.length === 0 ? <li>No scope assignments. You see only complaints that were explicitly addressed or assigned to you.</li> : s.scopes.map((x) => <li key={x}>{x}</li>)}
        </ul>
      </section>
    </main>
  );
}
