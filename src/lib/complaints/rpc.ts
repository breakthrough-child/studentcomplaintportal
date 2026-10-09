// Submission RPC mapping (pure). The ONLY path that creates a complaint is the database function
// public.submit_complaint (atomic: complaint + explicit assignment + sensitivity routing + audit).
// This module only builds its arguments from validated input and checks its reply.
import { z } from "zod";
import type { SubmitComplaintInput, Urgency } from "./schema";

/** Exact parameter list of public.submit_complaint (checked against the migration in tests). */
export type SubmitRpcArgs = {
  readonly p_title: string;
  readonly p_description: string;
  readonly p_category_id: string;
  readonly p_target_lecturer_profile_id: string;
  readonly p_level_id: string | null;
  readonly p_department_id: string | null;
  readonly p_priority: Urgency;
};

/**
 * The student's identity is NOT an argument: the function reads auth.uid() itself.
 * Level/department are the complaint's own scope as chosen on the form (null = profile values);
 * they are never taken from the selected lecturer.
 */
export function buildSubmitRpcArgs(input: SubmitComplaintInput): SubmitRpcArgs {
  return {
    p_title: input.title,
    p_description: input.description,
    p_category_id: input.categoryId,
    p_target_lecturer_profile_id: input.targetLecturerId,
    p_level_id: input.levelId ?? null,
    p_department_id: input.departmentId ?? null,
    p_priority: input.urgency,
  };
}

const submitRowSchema = z.object({
  new_complaint_id: z.string().uuid(),
  new_reference_number: z.string().min(1).max(64),
});

/** A returns-table RPC yields an array of rows; exactly one is expected. Anything else fails closed. */
export function parseSubmitResult(data: unknown): { id: string; reference: string } | null {
  const rows = z.array(submitRowSchema).length(1).safeParse(data);
  if (!rows.success) return null;
  const row = rows.data[0];
  return row ? { id: row.new_complaint_id, reference: row.new_reference_number } : null;
}
