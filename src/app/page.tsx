// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import Link from "next/link";

const points = [
  { title: "Private by design", body: "Only you and the lecturers who are authorised to handle your complaint can read it. Evidence files are never public." },
  { title: "Choose who hears you", body: "Pick the lecturer you want to address, whatever their department or level. Sensitive matters are reviewed by a main lecturer first." },
  { title: "Always know where it stands", body: "Follow each complaint from submission to resolution and continue the conversation with follow-up messages and evidence." },
] as const;

export default function HomePage() {
  return (
    <main id="main" className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-20">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">University portal</p>
      <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        Raise a concern with your lecturers, privately and with a clear record.
      </h1>
      <p className="mt-4 max-w-2xl text-base text-slate-600">
        The Student Complaint Portal lets verified students submit complaints, attach evidence and follow the response.
        Accounts are created by the university; there is no public sign-up.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="inline-flex items-center rounded-md bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-800"
        >
          Sign in
        </Link>
        <Link
          href="/forgot-password"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Forgot your password?
        </Link>
      </div>
      <ul className="mt-14 grid gap-4 sm:grid-cols-3">
        {points.map((p) => (
          <li key={p.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{p.title}</h2>
            <p className="mt-2 text-sm text-slate-600">{p.body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
