// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttachmentList } from "@/components/attachments";
import { AssignForm, EscalateForm, RevokeButton, StaffReplyForm, StatusForm } from "@/components/staff/action-forms";
import { allowedStaffTransitions } from "@/lib/staff/actions";
import { getStaffComplaint, listAssignableLecturers } from "@/lib/staff/data";
import { assignAction, escalateAction, replyAction, revokeAction, statusAction } from "./actions";

export const metadata: Metadata = { title: "Complaint" };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

export default async function StaffComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getStaffComplaint(id); // enforces the staff role; RLS decides whether the row exists for this user
  if (view.state === "not_found") notFound();
  if (view.state === "error") {
    return <main id="main" className="mx-auto max-w-4xl space-y-3 p-6"><p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">{view.message}</p><Link className="underline" href="/lecturer/complaints">Back to complaints</Link></main>;
  }
  const { complaint: c, me } = view;
  const isMain = me.role === "main_lecturer";
  const lecturers = isMain ? await listAssignableLecturers() : null;
  const back = isMain ? "/main-lecturer/complaints" : "/lecturer/complaints";

  return (
    <main id="main" className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Link className="text-sm underline" href={back}>← Complaints</Link>
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">{c.title}</h1>
          <p className="text-sm text-slate-600">{c.reference} · <strong>{c.statusLabel}</strong>{c.isSensitive ? " · Restricted" : ""}{c.requiresTriage ? " · Needs triage" : ""}</p>
        </header>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="font-medium">Student</dt><dd>{view.studentName}</dd></div>
          <div><dt className="font-medium">Category</dt><dd>{view.categoryName ?? "Not available"}</dd></div>
          <div><dt className="font-medium">Student&apos;s level</dt><dd>{view.levelName ?? "Not available"}</dd></div>
          <div><dt className="font-medium">Student&apos;s department</dt><dd>{view.departmentName ?? "Not available"}</dd></div>
          <div><dt className="font-medium">Addressed to</dt><dd>{view.recipientName ?? "A lecturer"}</dd></div>
          <div><dt className="font-medium">Priority</dt><dd className="capitalize">{c.priority}</dd></div>
          <div><dt className="font-medium">Submitted</dt><dd>{when(c.createdAt)}</dd></div>
          <div><dt className="font-medium">Last activity</dt><dd>{when(c.lastActivityAt)}</dd></div>
        </dl>

        <section aria-labelledby="desc"><h2 id="desc" className="font-medium">Complaint</h2><p className="mt-1 whitespace-pre-wrap">{c.description}</p><AttachmentList items={view.attachments.filter((a) => a.messageId === null)} complaintId={c.id} area="lecturer" canRemove={c.status !== "closed"} /></section>

        <section aria-labelledby="conv" className="space-y-3">
          <h2 id="conv" className="font-medium">Conversation</h2>
          {view.conversation.length === 0 ? <p className="text-sm text-slate-600">No messages yet.</p> : (
            <ol className="space-y-3">
              {view.conversation.map((m) => (
                <li key={m.id} className={m.fromYou ? "rounded-md bg-brand-50 p-3" : "rounded-md border border-slate-200 bg-white p-3"}>
                  <p className="text-xs text-slate-600">{m.author} · {when(m.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                  <AttachmentList items={m.attachments} complaintId={c.id} area="lecturer" canRemove={c.status !== "closed"} />
                </li>
              ))}
            </ol>
          )}
          <StaffReplyForm complaintId={c.id} action={replyAction} />
        </section>
      </div>

      <aside className="space-y-6" aria-label="Actions and history">
        <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
          <StatusForm complaintId={c.id} options={allowedStaffTransitions(c.status)} action={statusAction} />
          <EscalateForm complaintId={c.id} action={escalateAction} />
        </section>

        {isMain ? (
          <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4" aria-labelledby="routing">
            <h2 id="routing" className="font-medium">Routing</h2>
            {lecturers === null ? <p role="alert" className="text-sm text-red-700">The list of lecturers could not be loaded.</p> : (
              <AssignForm complaintId={c.id} action={assignAction} lecturers={lecturers.map((l) => ({ id: l.id, label: `${l.title ? `${l.title} ` : ""}${l.name}${l.department ? ` (${l.department})` : ""}` }))} />
            )}
            <h3 className="text-sm font-medium">Who can open this complaint</h3>
            <ul className="space-y-1 text-sm">
              {view.access.length === 0 ? <li className="text-slate-600">No explicit grants. Access is by assignment scope.</li> : view.access.map((g) => (
                <li key={g.profileId} className="flex flex-wrap items-center justify-between gap-2"><span>{g.name} <span className="text-slate-600">({g.reason})</span></span><RevokeButton complaintId={c.id} profileId={g.profileId} name={g.name} action={revokeAction} /></li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="hist" className="rounded-md border border-slate-200 bg-white p-4">
          <h2 id="hist" className="font-medium">History</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {view.timeline.map((t) => <li key={t.id}><span className="block text-xs text-slate-600">{when(t.at)}</span>{t.text}</li>)}
          </ol>
        </section>
      </aside>
    </main>
  );
}
