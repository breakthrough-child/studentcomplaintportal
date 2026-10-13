import Link from "next/link";
import { lecturerLabel, type LevelAdvisor } from "@/lib/complaints/lecturers";

/**
 * "Your level advisor" for students. Always rendered, so students know where to look:
 * the advisor, "none appointed yet for <level>", or "shown after approval" for pending accounts.
 */
export function LevelAdvisorCard({ advisor, approved, levelLabel, compact = false }: {
  advisor: LevelAdvisor | null;
  approved: boolean;
  levelLabel: string | null;
  compact?: boolean;
}) {
  const heading = (
    <h2 id="level-advisor" className="text-xs font-semibold uppercase tracking-wide text-slate-600">
      Your level advisor{advisor?.advises[0] ? ` · ${advisor.advises[0]}` : levelLabel ? ` · ${levelLabel}` : ""}
    </h2>
  );
  if (advisor) {
    return (
      <section aria-labelledby="level-advisor" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-300 bg-gold-50 p-4 dark:border-gold-600 dark:bg-slate-50">
        <div className="min-w-0">
          {heading}
          <p className="mt-1 font-semibold text-slate-900">{lecturerLabel(advisor)}</p>
          {compact ? null : <p className="mt-1 text-sm text-slate-600">Your first point of contact for issues at your level. Complaints you send them are private to them, like any complaint.</p>}
        </div>
        <Link href="/student/complaints/new" className="rounded-md bg-brand-700 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-800">Write to them</Link>
      </section>
    );
  }
  return (
    <section aria-labelledby="level-advisor" className="rounded-xl border border-dashed border-slate-300 bg-white p-4">
      {heading}
      <p className="mt-1 text-sm text-slate-600">
        {approved
          ? "No level advisor has been appointed for your department and level yet. You can still send a complaint to any lecturer."
          : "Your level advisor will be shown here once an administrator approves your account."}
      </p>
    </section>
  );
}
