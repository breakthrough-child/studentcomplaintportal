import Link from "next/link";
import { BrandLink } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SITE } from "@/lib/site";

const points = [
  { title: "Private by design", body: "Only you and the lecturers who are authorised to handle your complaint can read it. Evidence files are never public.", icon: "M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3Z" },
  { title: "Choose who hears you", body: "Pick the lecturer you want to address, whatever their department or level. Sensitive matters are reviewed by a main lecturer first.", icon: "M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0" },
  { title: "Always know where it stands", body: "Follow each complaint from submission to resolution and continue the conversation with follow-up messages and evidence.", icon: "M4 12h4l3 7 4-14 3 7h2" },
] as const;

const steps = ["Create your account", "An administrator approves it", "Submit and follow your complaint"] as const;

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-4 border-gold-500 bg-navy-700 dark:bg-navy-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <BrandLink />
          <div className="flex items-center gap-2">
            <ThemeToggle className="text-snow hover:bg-snow/10" />
            <Link href="/login" className="hidden rounded-md px-3 py-2 text-sm font-semibold text-snow hover:bg-snow/10 sm:inline-flex">Sign in</Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="relative overflow-hidden bg-navy-700 text-snow dark:bg-navy-900">
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-gold-500/15 blur-3xl" />
          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-400">{SITE.institution} · {SITE.name}</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              Raise a concern with your lecturers, <span className="text-gold-400">privately</span> and with a clear record.
            </h1>
            <p className="mt-5 max-w-2xl text-base text-navy-100 sm:text-lg">
              Submit complaints, attach evidence and follow the response. Students and lecturers register themselves; every account is approved by a university administrator.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center rounded-lg bg-gold-500 px-6 py-3 text-sm font-bold text-navy-900 shadow-sm hover:bg-gold-400">
                Create an account
              </Link>
              <Link href="/login" className="inline-flex items-center justify-center rounded-lg border border-navy-300 px-6 py-3 text-sm font-semibold text-snow hover:border-gold-400 hover:text-gold-300">
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="why" className="relative z-10 mx-auto -mt-8 max-w-6xl px-4 sm:-mt-12 sm:px-6">
          <h2 id="why" className="sr-only">Why use the portal</h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {points.map((p) => (
              <li key={p.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg shadow-navy-900/5">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gold-100 text-navy-700 dark:bg-gold-500 dark:text-navy-900">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={p.icon} /></svg>
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{p.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="how" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="how" className="text-xl font-bold text-slate-900 sm:text-2xl">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-700 text-sm font-bold text-gold-400">{i + 1}</span>
                <span className="text-sm font-medium text-slate-800">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-slate-600">
            Forgot your password? <Link href="/forgot-password" className="font-semibold text-brand-700 underline-offset-2 hover:underline">Reset it here</Link>.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-5 text-center text-xs text-slate-500">
        {SITE.institution} · {SITE.name}
      </footer>
    </div>
  );
}
