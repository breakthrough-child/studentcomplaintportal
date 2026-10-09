// UNVERIFIED: depends on next and react, which could not be installed when this was written.
export default function Loading() {
  return (
    <main id="main" className="mx-auto max-w-3xl p-6" aria-busy="true">
      <p role="status" className="text-slate-600">Loading your complaints...</p>
    </main>
  );
}
