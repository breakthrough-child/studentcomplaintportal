// UNVERIFIED: depends on next and react, which could not be installed when this was written.
"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { submitComplaintAction } from "./actions";
import { LecturerPicker } from "./lecturer-picker";
import type { LevelAdvisor } from "@/lib/complaints/lecturers";
import { FileInput } from "@/components/attachments";
import { PRIVACY_NOTICE_POINTS, routingNotice } from "@/lib/complaints/options";
import { DESCRIPTION_MAX, TITLE_MAX, URGENCY_LABELS, URGENCY_LEVELS, initialSubmitState } from "@/lib/complaints/schema";

type Choice = { id: string; name: string };
type CategoryChoice = Choice & { description: string | null; sensitive: boolean };

const input = "w-full rounded-md border border-slate-300 px-3 py-2 text-sm";

function Err({ id, text }: { id: string; text: string | undefined }) {
  return text ? <p id={id} role="alert" className="text-sm text-red-700">{text}</p> : null;
}

export function ComplaintForm({
  levels, departments, categories, defaultLevelId, defaultDepartmentId, allowScopeOverride, advisor,
}: {
  levels: Choice[]; departments: Choice[]; categories: CategoryChoice[];
  defaultLevelId: string; defaultDepartmentId: string; allowScopeOverride: boolean; advisor: LevelAdvisor | null;
}) {
  const [state, action, pending] = useActionState(submitComplaintAction, initialSubmitState);
  const v = state.values;
  const e = state.fieldErrors ?? {};
  const [categoryId, setCategoryId] = useState(v?.categoryId ?? "");
  const chosen = categories.find((c) => c.id === categoryId);

  if (state.ok) {
    return (
      <section role="status" className="space-y-2 rounded-md border border-green-300 bg-green-50 p-4">
        <h2 className="font-semibold">{state.message}</h2>
        {state.reference ? <p>Your reference number is <strong>{state.reference}</strong>. Keep it for your records.</p> : null}
        <Link href="/student/complaints" className="underline">View my complaints</Link>
      </section>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {state.message ? <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{state.message}</p> : null}

      <div className="space-y-1.5">
        <label htmlFor="title" className="block text-sm font-medium">Title</label>
        <input id="title" name="title" required maxLength={TITLE_MAX + 100} defaultValue={v?.title ?? ""} aria-describedby="title-error" aria-invalid={e.title ? true : undefined} className={input} />
        <Err id="title-error" text={e.title} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="categoryId" className="block text-sm font-medium">Category</label>
        <select id="categoryId" name="categoryId" required value={categoryId} onChange={(ev) => setCategoryId(ev.target.value)} aria-describedby="categoryId-error" className={input}>
          <option value="">Choose a category</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {chosen?.description ? <p className="text-sm text-slate-600">{chosen.description}</p> : null}
        {chosen ? <p className="text-sm text-slate-700">{routingNotice(chosen.sensitive)}</p> : null}
        <Err id="categoryId-error" text={e.categoryId} />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm font-medium">Description</label>
        <textarea id="description" name="description" required rows={8} maxLength={DESCRIPTION_MAX + 500} defaultValue={v?.description ?? ""} aria-describedby="description-error" aria-invalid={e.description ? true : undefined} className={input} />
        <Err id="description-error" text={e.description} />
      </div>

      <LecturerPicker departments={departments} levels={levels} initialId={v?.targetLecturerId ?? ""} error={e.targetLecturerId} advisor={advisor} />

      {allowScopeOverride ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="text-sm font-medium">Your level and department for this complaint</legend>
          <div>
            <label htmlFor="levelId" className="sr-only">Level</label>
            <select id="levelId" name="levelId" defaultValue={v?.levelId ?? defaultLevelId} className={input}>
              <option value="">Use my registered level</option>
              {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <Err id="levelId-error" text={e.levelId} />
          </div>
          <div>
            <label htmlFor="departmentId" className="sr-only">Department</label>
            <select id="departmentId" name="departmentId" defaultValue={v?.departmentId ?? defaultDepartmentId} className={input}>
              <option value="">Use my registered department</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <Err id="departmentId-error" text={e.departmentId} />
          </div>
        </fieldset>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="urgency" className="block text-sm font-medium">Urgency</label>
        <select id="urgency" name="urgency" defaultValue={v?.urgency || "normal"} className={input}>
          {URGENCY_LEVELS.map((u) => <option key={u} value={u}>{URGENCY_LABELS[u]}</option>)}
        </select>
        <Err id="urgency-error" text={e.urgency} />
      </div>

      <FileInput error={e.files} />

      <section className="rounded-md bg-slate-50 p-3 text-sm">
        <h2 className="font-medium">Privacy notice</h2>
        <ul className="mt-1 list-disc pl-5">{PRIVACY_NOTICE_POINTS.map((p) => <li key={p}>{p}</li>)}</ul>
        <label className="mt-2 flex items-start gap-2">
          <input type="checkbox" name="acknowledgePrivacy" defaultChecked={v?.acknowledgePrivacy === "on"} aria-describedby="ack-error" />
          <span>I have read the privacy notice.</span>
        </label>
        <Err id="ack-error" text={e.acknowledgePrivacy} />
      </section>

      <button type="submit" disabled={pending} className="rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
        {pending ? "Submitting..." : "Submit complaint"}
      </button>
    </form>
  );
}
