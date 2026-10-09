// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { partialFailureMessage } from "@/lib/attachments/form";
import { storeFiles, validateSubmittedFiles } from "@/lib/attachments/upload";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedStudent } from "@/lib/auth/guards";
import { mapRpcError } from "./rpc-errors";
import { buildReplyRpcArgs, echoReplyBody, parseReply, type ReplyState } from "./reply";
import { fieldErrors } from "@/lib/validation/form";
import { parseReopen, reopenArgs, type ActionState } from "@/lib/staff/actions";
import { ATTACHMENT_COLUMNS, parseAttachments } from "@/lib/staff/view";
import {
  DETAIL_COLUMNS, GENERIC_ERROR, containsPattern, searchColumn, LIST_COLUMNS, MESSAGE_COLUMNS, complaintIdSchema, listRange, parseComplaintDetail,
  parseComplaintList, parseListQuery, parseName, parseThread, shapeList, type DetailResult, type ListResult,
} from "./student-view";

/**
 * The signed-in student's own complaints. Authorization is Row Level Security (a student can read
 * only complaints whose student record is linked to auth.uid()). The explicit student_id filter
 * below is defence in depth and a query hint, not the access decision.
 */
export async function listMyComplaints(rawQuery: unknown): Promise<ListResult> {
  await requireApprovedStudent();
  const query = parseListQuery(rawQuery);
  const supabase = await createClient();

  const own = await supabase.from("students").select("id").maybeSingle();
  if (own.error || !own.data) return { state: "error", message: GENERIC_ERROR };

  const { from, to } = listRange(query.page);
  let q = supabase.from("complaints").select(LIST_COLUMNS).eq("student_id", (own.data as { id: string }).id);
  if (query.status) q = q.eq("status", query.status);
  if (query.categoryId) q = q.eq("category_id", query.categoryId);
  if (query.q) q = q.ilike(searchColumn(query.q), containsPattern(query.q));
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
  if (error) return { state: "error", message: GENERIC_ERROR };

  const rows = parseComplaintList(data);
  return rows ? shapeList(rows, query) : { state: "error", message: GENERIC_ERROR };
}

/**
 * One complaint plus its conversation. A malformed id, a complaint that does not exist and a
 * complaint that belongs to someone else all give the same "not_found" (RLS returns no row), so
 * the page cannot be used to probe which ids exist.
 */
export async function getMyComplaint(rawId: unknown): Promise<DetailResult> {
  const profile = await requireApprovedStudent();
  const id = complaintIdSchema.safeParse(rawId);
  if (!id.success) return { state: "not_found" };

  const supabase = await createClient();
  const found = await supabase.from("complaints").select(DETAIL_COLUMNS).eq("id", id.data).maybeSingle();
  if (found.error) return { state: "error", message: GENERIC_ERROR };
  if (!found.data) return { state: "not_found" };
  const complaint = parseComplaintDetail(found.data);
  if (!complaint) return { state: "error", message: GENERIC_ERROR };

  const msgs = await supabase
    .from("complaint_messages").select(MESSAGE_COLUMNS).eq("complaint_id", complaint.id)
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  if (msgs.error) return { state: "error", message: GENERIC_ERROR };
  const thread = parseThread(msgs.data, profile.id);
  if (!thread) return { state: "error", message: GENERIC_ERROR };

  // Attachment rows: RLS hides deleted files and files of complaints this student cannot access.
  const atts = await supabase.from("complaint_attachments").select(ATTACHMENT_COLUMNS).eq("complaint_id", complaint.id);
  const attachments = atts.error ? null : parseAttachments(atts.data, profile.id);
  if (!attachments) return { state: "error", message: GENERIC_ERROR };
  // Opening the page counts as reading it (drives the unread indicators). Best effort.
  await supabase.rpc("mark_complaint_read", { p_complaint_id: complaint.id });

  // Names are display-only and best effort: RLS decides whether this student may read them, and a
  // failed lookup must not hide the complaint itself.
  const [lecturer, category] = await Promise.all([
    supabase.from("profiles").select("name:full_name").eq("id", complaint.targetLecturerId).maybeSingle(),
    supabase.from("complaint_categories").select("name").eq("id", complaint.categoryId).maybeSingle(),
  ]);
  return {
    state: "ok",
    complaint,
    thread,
    attachments,
    recipientName: lecturer.error ? null : parseName(lecturer.data),
    categoryName: category.error ? null : parseName(category.data),
  };
}

/** Days a resolved complaint can be reopened (read only to decide whether to show the button; the database enforces it). */
export async function getReopenWindowDays(): Promise<number> {
  const { data } = await (await createClient()).from("app_settings").select("value").eq("key", "reopen_window_days").maybeSingle();
  return typeof data?.value === "number" && Number.isInteger(data.value) && data.value >= 0 ? data.value : 30;
}

/** Student asks to reopen their own resolved complaint. The RPC re-checks ownership, status and the window. */
export async function reopenComplaint(source: { get(name: string): unknown }): Promise<ActionState> {
  await requireApprovedStudent();
  const parsed = parseReopen(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).rpc("transition_complaint_status", reopenArgs(parsed.data));
  if (error) return { ok: false, message: mapRpcError(error, "student_status").message };
  return { ok: true, message: "Your complaint has been reopened." };
}

/** Posts a reply through post_message (the only write path; it re-checks access and closed state). */
export async function replyToComplaint(source: { get(name: string): unknown }, fileValues: readonly unknown[] = []): Promise<ReplyState> {
  await requireApprovedStudent();
  const body = echoReplyBody(source);
  const parsed = parseReply(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), body };

  const prepared = await validateSubmittedFiles(fileValues);
  if (!prepared.ok) return { ok: false, fieldErrors: { files: prepared.errors.join(" ") }, body };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_message", buildReplyRpcArgs(parsed.data));
  if (error) return { ok: false, message: mapRpcError(error, "reply").message, body };
  if (typeof data !== "string") {
    // Unexpected reply shape: the message may have been saved, so do not invite a duplicate.
    return { ok: true, message: "Your message was sent. Reload the page to see it." };
  }
  const failed = prepared.files.length > 0 ? await storeFiles(parsed.data.complaintId, data, prepared.files) : [];
  return { ok: true, message: partialFailureMessage("Your message was sent.", failed) };
}
