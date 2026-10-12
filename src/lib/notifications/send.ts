import "server-only";
import { after } from "next/server";
import nodemailer, { type Transporter } from "nodemailer";
import { z } from "zod";
import { getPublicEnv } from "@/lib/env/public";
import { parseMailEnv, type MailConfig } from "@/lib/env/schema";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { NOTIFICATION_KINDS, buildNotificationEmail } from "./message";

/*
 * Sends queued notification e-mails (public.notification_outbox) over SMTP.
 *
 * SERVICE ROLE, deliberately and narrowly: lecturers' e-mail addresses are not readable by the student
 * whose request created the complaint, so delivery cannot run with the user's session. This module only
 * calls claim_notifications() and complete_notification(), which are executable by service_role alone,
 * and it never reads complaint content. Rows are created by database triggers, so a failure here never
 * loses a notification: it stays queued and is retried (max 5 attempts) on the next run.
 */

const claimed = z.array(z.object({
  id: z.string().uuid(),
  kind: z.enum(NOTIFICATION_KINDS),
  complaint_id: z.string().uuid(),
  reference_number: z.string(),
  recipient_email: z.string().email(),
  recipient_name: z.string(),
}));

let transport: { key: string; t: Transporter } | null = null;
function transporter(c: MailConfig): Transporter {
  const key = `${c.host}:${c.port}:${c.secure}:${c.user ?? ""}`;
  if (!transport || transport.key !== key) {
    transport = {
      key,
      t: nodemailer.createTransport({
        host: c.host, port: c.port, secure: c.secure,
        auth: c.user && c.password ? { user: c.user, pass: c.password } : undefined,
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
      }),
    };
  }
  return transport.t;
}

let warned = false;
export type SendResult = { readonly sent: number; readonly failed: number; readonly configured: boolean };

/** Sends up to `limit` queued e-mails. Never throws. */
export async function sendPendingNotifications(limit = 20): Promise<SendResult> {
  const mail = parseMailEnv(process.env);
  if (!mail.ok) {
    if (!warned) { console.warn(`notification e-mails are queued but not sent: ${mail.reason}`); warned = true; }
    return { sent: 0, failed: 0, configured: false };
  }
  let sent = 0;
  let failed = 0;
  try {
    const db = createServiceRoleClient();
    const { data, error } = await db.rpc("claim_notifications", { p_limit: limit });
    if (error) { console.error("claim_notifications failed"); return { sent, failed, configured: true }; }
    const rows = claimed.safeParse(data);
    if (!rows.success) { console.error("claim_notifications returned an unexpected shape"); return { sent, failed, configured: true }; }
    const site = getPublicEnv().NEXT_PUBLIC_SITE_URL;
    for (const r of rows.data) {
      const email = buildNotificationEmail({ kind: r.kind, complaintId: r.complaint_id, reference: r.reference_number, recipientName: r.recipient_name, siteUrl: site });
      let ok = false;
      let reason: string | null = null;
      if (!email) {
        reason = "message could not be built";
      } else {
        try {
          await transporter(mail.config).sendMail({ from: mail.config.from, to: r.recipient_email, subject: email.subject, text: email.text, html: email.html });
          ok = true;
        } catch (e) {
          // Keep the SMTP error class/code only; never log addresses or credentials.
          reason = e && typeof e === "object" && "code" in e ? `smtp error ${String((e as { code: unknown }).code)}` : "smtp error";
        }
      }
      await db.rpc("complete_notification", { p_id: r.id, p_ok: ok, p_error: reason });
      if (ok) sent += 1; else failed += 1;
    }
  } catch {
    console.error("sending notification e-mails failed");
  }
  return { sent, failed, configured: true };
}

/** Sends queued e-mails AFTER the response has been sent, so users never wait for SMTP. */
export function deliverNotificationsSoon(): void {
  after(async () => { await sendPendingNotifications(); });
}
