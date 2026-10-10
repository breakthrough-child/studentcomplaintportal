// UNVERIFIED: depends on next and react, which could not be installed when this was written.
export default function Loading() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8" aria-busy="true">
      <p role="status" className="text-slate-600">Loading your complaints...</p>
    </main>
  );
}
