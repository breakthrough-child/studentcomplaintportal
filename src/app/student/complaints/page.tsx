// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { listMyComplaints } from "@/lib/complaints/student-data";
import { getUnread } from "@/lib/complaints/overview-data";
import { loadFormOptions } from "@/lib/complaints/data";
import { COMPLAINT_STATUSES, STATUS_LABELS, parseListQuery } from "@/lib/complaints/student-view";

export const metadata: Metadata = { title: "My complaints" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export default async function MyComplaintsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const query = parseListQuery(raw);
  const [result, options, unread] = await Promise.all([listMyComplaints(raw), loadFormOptions(), getUnread()]); // both enforce: signed in, student, approved; RLS limits rows
  const categories = options.ok ? options.categories : [];
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const href = (page: number) => {
    const p = new URLSearchParams();
    if (query.status) p.set("status", query.status);
    if (query.categoryId) p.set("categoryId", query.categoryId);
    if (query.q) p.set("q", query.q);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return `/student/complaints${qs ? `?${qs}` : ""}`;
  };

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My complaints</h1>
        <Link href="/student/complaints/new" className="rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">New complaint</Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="block font-medium">Search</span>
          <input type="search" name="q" defaultValue={query.q ?? ""} maxLength={100} placeholder="Title or reference" className="mt-1 rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="block font-medium">Status</span>
          <select name="status" defaultValue={query.status ?? ""} className="mt-1 rounded-md border border-slate-300 px-3 py-2">
            <option value="">All</option>
            {COMPLAINT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="block font-medium">Category</span>
          <select name="categoryId" defaultValue={query.categoryId ?? ""} className="mt-1 rounded-md border border-slate-300 px-3 py-2">
            <option value="">All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50">Filter</button>
      </form>

      {result.state === "error" ? <p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">{result.message}</p> : null}

      {result.state === "empty" ? (
        <p className="rounded-md border border-dashed border-slate-300 p-6 text-center text-slate-600">
          {result.filtered ? "No complaints match this filter." : "You have not submitted any complaints yet."}{" "}
          {result.filtered ? <Link className="underline" href="/student/complaints">Clear filter</Link> : <Link className="underline" href="/student/complaints/new">Submit your first complaint</Link>}
        </p>
      ) : null}

      {result.state === "ok" ? (
        <>
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
            {result.items.map((c) => (
              <li key={c.id}>
                <Link href={`/student/complaints/${c.id}`} className="block px-4 py-3 hover:bg-slate-50">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{c.title}{(unread.byComplaint.get(c.id)?.unread ?? 0) > 0 ? <span className="ml-2 rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">{unread.byComplaint.get(c.id)?.unread} new</span> : null}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{c.statusLabel}</span>
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">{c.reference} · {categoryName.get(c.categoryId) ?? "Category"} · Submitted {date(c.createdAt)} · Last activity {date(c.lastActivityAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <nav className="flex justify-between text-sm" aria-label="Pages">
            {result.page > 1 ? <Link className="underline" href={href(result.page - 1)}>Previous</Link> : <span />}
            {result.hasMore ? <Link className="underline" href={href(result.page + 1)}>Next</Link> : <span />}
          </nav>
        </>
      ) : null}
    </main>
  );
}
