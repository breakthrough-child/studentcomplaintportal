// Student reply (pure). The only write path is the database function post_message, which
// re-checks that the caller may take part in the complaint and that it is not closed.
import { z } from "zod";
import { codePointLength, containsForbiddenText } from "./schema";
import { complaintIdSchema, type ComplaintStatus } from "./student-view";

export const REPLY_MIN = 1;
export const REPLY_MAX = 5000;

export const replySchema = z
  .object({
    complaintId: complaintIdSchema,
    body: z
      .string({ required_error: "Write a message", invalid_type_error: "Write a message" })
      .transform((s) => s.replace(/\r\n?/g, "\n").trim())
      .superRefine((s, ctx) => {
        const n = codePointLength(s);
        if (n < REPLY_MIN) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Write a message" });
        else if (n > REPLY_MAX) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `The message must be at most ${REPLY_MAX} characters` });
        if (containsForbiddenText(s, true)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The message contains characters that are not allowed" });
      }),
  })
  .strict();
export type ReplyInput = z.infer<typeof replySchema>;

export const REPLY_FIELDS = ["complaintId", "body"] as const;

/** Reads ONLY the allow-listed fields; anything else the client sent is ignored. */
export function parseReply(source: { get(name: string): unknown }) {
  const raw: Record<string, unknown> = {};
  for (const f of REPLY_FIELDS) {
    const v = source.get(f);
    raw[f] = v === null ? undefined : v;
  }
  return replySchema.safeParse(raw);
}

/** Exact parameter list of public.post_message (checked against the migration in tests). */
export function buildReplyRpcArgs(input: ReplyInput): { readonly p_complaint_id: string; readonly p_body: string } {
  return { p_complaint_id: input.complaintId, p_body: input.body };
}

/** UI convenience only: post_message is the real gate and answers 55000 for a closed complaint. */
export function canStudentReply(status: ComplaintStatus): boolean {
  return status !== "closed";
}

export type ReplyState = {
  readonly ok: boolean;
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly body?: string;
};
export const initialReplyState: ReplyState = { ok: false };

export function echoReplyBody(source: { get(name: string): unknown }): string {
  const v = source.get("body");
  return typeof v === "string" ? v.slice(0, REPLY_MAX + 500) : "";
}
