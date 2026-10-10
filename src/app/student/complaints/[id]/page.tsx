// UNVERIFIED: depends on next and react, which could not be installed when this was written.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMyComplaint, getReopenWindowDays } from "@/lib/complaints/student-data";
import { canStudentReopen, canStudentReply } from "@/lib/complaints/reply";
import { ReplyForm } from "./reply-form";
import { ReopenForm } from "./reopen-form";
import { AttachmentList } from "@/components/attachments";

export const metadata: Metadata = { title: "Complaint" };

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";

export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getMyComplaint(id); // enforces: signed in, student, approved; RLS limits the row
  if (result.state === "not_found") notFound();
  if (result.state === "error") {
    return (
      <main id="main" className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6 sm:py-8">
        <p role="alert" className="rounded-md bg-red-50 p-3 text-red-800">{result.message}</p>
        <Link className="underline" href="/student/complaints">Back to my complaints</Link>
      </main>
    );
  }
  const { complaint: c, thread, attachments, recipientName, categoryName } = result;
  const closed = !canStudentReply(c.status);
  const reopenable = c.status === "resolved" && canStudentReopen(c.status, c.resolvedAt, await getReopenWindowDays(), new Date());

  return (
    <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <Link className="text-sm underline" href="/student/complaints">← My complaints</Link>
      <header className="space-y-1">
        <h1 className="border-l-4 border-gold-500 pl-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{c.title}</h1>
        <p className="text-sm text-slate-600">{c.reference} · <strong>{c.statusLabel}</strong></p>
      </header>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="font-medium">Sent to</dt><dd>{recipientName ?? "Your chosen lecturer"}</dd></div>
        <div><dt className="font-medium">Category</dt><dd>{categoryName ?? "Not available"}</dd></div>
        <div><dt className="font-medium">Submitted</dt><dd>{when(c.createdAt)}</dd></div>
        <div><dt className="font-medium">Last activity</dt><dd>{when(c.lastActivityAt)}</dd></div>
        {c.resolvedAt ? <div><dt className="font-medium">Resolved</dt><dd>{when(c.resolvedAt)}</dd></div> : null}
        {c.closedAt ? <div><dt className="font-medium">Closed</dt><dd>{when(c.closedAt)}</dd></div> : null}
      </dl>
      {c.isSensitive ? <p className="rounded-md bg-slate-50 p-3 text-sm">This complaint is handled confidentially. A main lecturer reviews it before it is released to the lecturer you chose.</p> : null}

      <section aria-labelledby="desc"><h2 id="desc" className="font-medium">Your complaint</h2><p className="mt-1 whitespace-pre-wrap">{c.description}</p><AttachmentList items={attachments.filter((a) => a.messageId === null)} complaintId={c.id} area="student" canRemove={!closed} /></section>

      <section aria-labelledby="conv" className="space-y-3">
        <h2 id="conv" className="font-medium">Conversation</h2>
        {thread.length === 0 ? <p className="text-sm text-slate-600">No replies yet.</p> : (
          <ol className="space-y-3">
            {thread.map((m) => (
              <li key={m.id} className={m.fromYou ? "rounded-md bg-brand-50 p-3" : "rounded-md border border-slate-200 p-3"}>
                <p className="text-xs text-slate-600">{m.fromYou ? "You" : "Staff"} · {when(m.createdAt)}</p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                <AttachmentList items={attachments.filter((a) => a.messageId === m.id)} complaintId={c.id} area="student" canRemove={!closed} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {reopenable ? <ReopenForm complaintId={c.id} /> : null}

      {canStudentReply(c.status) ? <ReplyForm complaintId={c.id} /> : <p className="rounded-md bg-slate-50 p-3 text-sm">This complaint is closed, so replies are turned off.</p>}
    </main>
  );
}
