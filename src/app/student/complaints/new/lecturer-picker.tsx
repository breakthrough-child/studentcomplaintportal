// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import { useState, useTransition } from "react";
import { searchLecturersAction } from "./search-action";
import { lecturerLabel, type LecturerOption } from "@/lib/complaints/lecturers";

type Choice = { id: string; name: string };

/**
 * Searches ALL lecturers (any department, any level). The filters here describe the LECTURER and
 * have no names, so they are never submitted with the form. Only `targetLecturerId` is, and the
 * server re-validates it in the database; nothing here is an authorization decision.
 */
export function LecturerPicker({
  departments,
  levels,
  initialId,
  error,
}: {
  departments: readonly Choice[];
  levels: readonly Choice[];
  initialId: string;
  error?: string | undefined;
}) {
  const [query, setQuery] = useState("");
  const [lecturerDepartmentId, setDept] = useState("");
  const [lecturerLevelId, setLevel] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<readonly LecturerOption[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<LecturerOption | null>(null);
  const [cleared, setCleared] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(nextPage: number) {
    startTransition(async () => {
      const res = await searchLecturersAction({ query, lecturerDepartmentId, lecturerLevelId, page: nextPage });
      if (res.ok) {
        setResults(res.lecturers);
        setHasMore(res.hasMore);
        setPage(res.page);
        setMessage(null);
      } else {
        setResults(null);
        setMessage(res.message);
      }
    });
  }

  const errorId = "targetLecturerId-error";
  return (
    <fieldset className="space-y-3" aria-describedby={error ? errorId : undefined}>
      <legend className="text-sm font-medium text-slate-800">Lecturer this complaint is for</legend>
      <input type="hidden" name="targetLecturerId" value={selected?.id ?? (cleared ? "" : initialId)} />

      {selected ? (
        <p className="flex items-center justify-between rounded-md border border-brand-700 bg-brand-50 px-3 py-2 text-sm">
          <span>Selected: {lecturerLabel(selected)}</span>
          <button type="button" className="font-semibold underline" onClick={() => { setSelected(null); setCleared(true); }}>
            Change
          </button>
        </p>
      ) : initialId && !cleared ? (
        <p className="text-sm text-slate-600">A lecturer was chosen earlier. Search again to change it.</p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-sm">
          <span className="sr-only">Lecturer name or course</span>
          <input
            type="search"
            value={query}
            maxLength={100}
            placeholder="Name or course, e.g. CSC 301"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                run(1);
              }
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="sr-only">Lecturer department</span>
          <select value={lecturerDepartmentId} onChange={(e) => setDept(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2">
            <option value="">Any department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="sr-only">Level the lecturer teaches</span>
          <select value={lecturerLevelId} onChange={(e) => setLevel(e.target.value)} className="w-full rounded-md border border-slate-300 bg-white px-3 py-2">
            <option value="">Any level</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="button" disabled={pending} onClick={() => run(1)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60">
        {pending ? "Searching..." : "Search lecturers"}
      </button>

      <div aria-live="polite" className="text-sm">
        {message ? <p role="alert" className="text-red-700">{message}</p> : null}
        {results && results.length === 0 ? <p className="text-slate-600">No lecturers matched. Try a shorter name, a course code such as CSC 301, or remove a filter.</p> : null}
        {results && results.length > 0 ? <p className="sr-only">{results.length} lecturers found</p> : null}
      </div>

      {results && results.length > 0 ? (
        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
          {results.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setSelected(l)} className="w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50">
                <span className="block font-medium">{lecturerLabel(l)}</span>
                {l.courses.length > 0 ? (
                  <span className="mt-1 flex flex-wrap gap-1" aria-label={`Courses: ${l.courses.join(", ")}`}>
                    {l.courses.map((c) => (
                      <span key={c} className="rounded bg-gold-100 px-1.5 py-0.5 text-xs font-medium text-navy-800 dark:bg-gold-500 dark:text-navy-900">{c}</span>
                    ))}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {results && (page > 1 || hasMore) ? (
        <div className="flex gap-2 text-sm">
          <button type="button" disabled={pending || page <= 1} onClick={() => run(page - 1)} className="underline disabled:opacity-50">Previous</button>
          <button type="button" disabled={pending || !hasMore} onClick={() => run(page + 1)} className="underline disabled:opacity-50">Next</button>
        </div>
      ) : null}
      {error ? <p id={errorId} role="alert" className="text-sm text-red-700">{error}</p> : null}
    </fieldset>
  );
}
