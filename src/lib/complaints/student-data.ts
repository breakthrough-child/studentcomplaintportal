// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedStudent } from "@/lib/auth/guards";
import { mapRpcError } from "./rpc-errors";
import { buildReplyRpcArgs, echoReplyBody, parseReply, type ReplyState } from "./reply";
import { fieldErrors } from "@/lib/validation/form";
import {
  DETAIL_COLUMNS, GENERIC_ERROR, LIST_COLUMNS, MESSAGE_COLUMNS, complaintIdSchema, listRange, parseComplaintDetail,
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
    recipientName: lecturer.error ? null : parseName(lecturer.data),
    categoryName: category.error ? null : parseName(category.data),
  };
}

/** Posts a reply through post_message (the only write path; it re-checks access and closed state). */
export async function replyToComplaint(source: { get(name: string): unknown }): Promise<ReplyState> {
  await requireApprovedStudent();
  const body = echoReplyBody(source);
  const parsed = parseReply(source);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error), body };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("post_message", buildReplyRpcArgs(parsed.data));
  if (error) return { ok: false, message: mapRpcError(error, "reply").message, body };
  if (typeof data !== "string") {
    // Unexpected reply shape: the message may have been saved, so do not invite a duplicate.
    return { ok: true, message: "Your message was sent. Reload the page to see it." };
  }
  return { ok: true, message: "Your message was sent." };
}
