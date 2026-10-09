// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/staff/actions";
import { deleteAttachmentAction } from "@/app/attachments/actions";
import { mimeLabel } from "@/lib/attachments/policy";

export const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.mp3,.m4a,.wav,.webm";

/** Optional multi-file input. The server re-validates size, extension, contents and type; this is only a convenience. */
export function FileInput({ error, id = "files" }: { error?: string; id?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">Attachments (optional)</label>
      <input id={id} name="files" type="file" multiple accept={ACCEPT} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} aria-invalid={error ? true : undefined} className="block w-full text-sm" />
      <p id={`${id}-hint`} className="text-xs text-slate-600">Images, PDF, Word documents or audio, up to 10 MB each. Files are checked on the server, stored privately and visible only to people who can open this complaint.</p>
      {error ? <p id={`${id}-error`} role="alert" className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

export type AttachmentItem = { id: string; filename: string; mimeType: string; sizeLabel: string; uploadedByYou: boolean };

function RemoveButton({ item, complaintId, area }: { item: AttachmentItem; complaintId: string; area: "student" | "lecturer" }) {
  const [state, run, pending] = useActionState(deleteAttachmentAction, initialActionState);
  return (
    <form action={run} className="inline" onSubmit={(e) => { if (!window.confirm(`Remove "${item.filename}"? Other people will no longer be able to open it.`)) e.preventDefault(); }}>
      <input type="hidden" name="attachmentId" value={item.id} />
      <input type="hidden" name="complaintId" value={complaintId} />
      <input type="hidden" name="area" value={area} />
      <button type="submit" disabled={pending} className="text-sm text-red-700 underline disabled:opacity-60">{pending ? "Removing..." : "Remove"}</button>
      {state.message && !state.ok ? <span role="alert" className="ml-2 text-sm text-red-700">{state.message}</span> : null}
    </form>
  );
}

/** Download links go through the authorised route; only the uploader sees Remove. */
export function AttachmentList({ items, complaintId, area, canRemove }: { items: readonly AttachmentItem[]; complaintId: string; area: "student" | "lecturer"; canRemove: boolean }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-sm" aria-label="Attachments">
      {items.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-x-3">
          <a href={`/api/attachments/${a.id}`} className="break-all underline" rel="nofollow">{a.filename}</a>
          <span className="text-slate-600">{mimeLabel(a.mimeType)}, {a.sizeLabel}</span>
          {canRemove && a.uploadedByYou ? <RemoveButton item={a} complaintId={complaintId} area={area} /> : null}
        </li>
      ))}
    </ul>
  );
}
