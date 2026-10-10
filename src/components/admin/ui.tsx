// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import Link from "next/link";
import { adminHref, type AdminListQuery } from "@/lib/admin/view";

export const INPUT = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-gold-500/40";

export function Page({ title, intro, children }: { title: string; intro?: string; children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="border-l-4 border-gold-500 pl-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {intro ? <p className="mt-1 max-w-3xl text-sm text-slate-600">{intro}</p> : null}
      </header>
      {children}
    </main>
  );
}

export function Card({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 id={id} className="mb-3 font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}

export function Field({ label, name, children, hint }: { label: string; name: string; children?: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-sm text-slate-600">{children}</p>;
}

export function LoadError() {
  return <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">This list could not be loaded. Please refresh; if it keeps happening, check the database connection.</p>;
}

export function Table({ head, children, label }: { head: string[]; children: React.ReactNode; label: string }) {
  return (
    <div className="table-scroll rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <caption className="sr-only">{label}</caption>
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr>{head.map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function SearchBar({ base, query, filters }: { base: string; query: AdminListQuery; filters?: readonly { value: string; label: string }[] }) {
  return (
    <form method="get" action={base} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end" role="search">
      <div className="sm:w-64"><label htmlFor="q" className="block text-xs font-medium text-slate-700">Search</label><input id="q" name="q" defaultValue={query.q ?? ""} maxLength={80} className={INPUT} /></div>
      {filters ? (
        <div className="sm:w-56"><label htmlFor="filter" className="block text-xs font-medium text-slate-700">Filter</label>
          <select id="filter" name="filter" defaultValue={query.filter ?? ""} className={INPUT}>
            <option value="">All</option>
            {filters.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select></div>
      ) : null}
      <button type="submit" className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">Apply</button>
    </form>
  );
}

export function Pager({ base, query, hasMore }: { base: string; query: AdminListQuery; hasMore: boolean }) {
  if (query.page === 1 && !hasMore) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
      {query.page > 1 ? <Link className="underline" href={adminHref(base, query, { page: query.page - 1 })}>Previous</Link> : <span />}
      <span>Page {query.page}</span>
      {hasMore ? <Link className="underline" href={adminHref(base, query, { page: query.page + 1 })}>Next</Link> : <span />}
    </nav>
  );
}

export const when = (iso: string) => iso.slice(0, 16).replace("T", " ");
