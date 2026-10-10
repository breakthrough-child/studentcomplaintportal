"use client";

import { useActionState } from "react";
import { avatarAction } from "@/app/account/avatar/actions";
import { AVATAR_ACCEPT, type AvatarState } from "@/lib/avatars/policy";

const BUTTON = "rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-60";

/** Upload / replace / remove form. Validation and re-encoding happen on the server. */
export function AvatarForm({ hasPicture }: { hasPicture: boolean }) {
  const [state, run, pending] = useActionState<AvatarState, FormData>(avatarAction, { ok: false });
  return (
    <form action={run} className="space-y-2">
      <label htmlFor="avatar" className="block text-sm font-medium">{hasPicture ? "Replace picture" : "Upload a picture"}</label>
      <input id="avatar" name="avatar" type="file" accept={AVATAR_ACCEPT} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium" aria-describedby="avatar-hint" />
      <p id="avatar-hint" className="text-xs text-slate-500">JPEG, PNG or WebP, up to 2 MB. It is resized to a square and any embedded camera or location data is removed.</p>
      {state.message ? <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-800" : "text-red-700"}`}>{state.message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="intent" value="upload" disabled={pending} className={`${BUTTON} bg-brand-700 text-white hover:bg-brand-800`}>{pending ? "Saving..." : "Save picture"}</button>
        {hasPicture ? <button type="submit" name="intent" value="remove" disabled={pending} className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>Remove picture</button> : null}
      </div>
    </form>
  );
}
