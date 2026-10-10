// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

// Shown if a page throws unexpectedly. The error text is never displayed (it may contain internals).
export default function ComplaintsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p role="alert" className="text-slate-700">We could not show this page. Please try again.</p>
      <button type="button" onClick={reset} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Try again</button>
    </main>
  );
}
