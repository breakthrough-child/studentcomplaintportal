// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import Link from "next/link";

// The same page for "no such complaint", "not yours" and a malformed id.
export default function ComplaintNotFound() {
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold">Complaint not found</h1>
      <p className="text-slate-700">This complaint does not exist, or you do not have access to it.</p>
      <Link className="underline" href="/student/complaints">Back to my complaints</Link>
    </main>
  );
}
