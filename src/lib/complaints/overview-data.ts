// UNVERIFIED: depends on next, react and @supabase/ssr, which could not be installed when this was written.
import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_UNREAD, parseStatusCounts, parseUnread, type StatusTotals, type UnreadSummary } from "./summary";

/** Counts of the complaints this user may see (SECURITY INVOKER function: RLS limits the rows). */
export async function getStatusTotals(): Promise<StatusTotals | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complaint_status_counts");
  return error ? null : parseStatusCounts(data);
}

/** Unread indicators from the database's own read receipts. Failure shows no badge, never an error. */
export const getUnread = cache(async (): Promise<UnreadSummary> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("unread_message_counts");
  if (error) return EMPTY_UNREAD;
  return parseUnread(data) ?? EMPTY_UNREAD;
});
