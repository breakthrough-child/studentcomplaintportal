// Notification e-mail content (pure). Deliberately minimal: e-mail is not a private channel, so a message
// never contains the complaint's title, text, category, attachments or the student's identity. Only the
// reference number and a link that requires signing in.
import { SITE } from "../site";

export const NOTIFICATION_KINDS = ["complaint_received", "triage_needed"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationInput = {
  readonly kind: NotificationKind;
  readonly complaintId: string;
  readonly reference: string;
  readonly recipientName: string;
  readonly siteUrl: string; // origin only, e.g. https://complaints.example.edu
};
export type NotificationEmail = { readonly subject: string; readonly text: string; readonly html: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REFERENCE = /^CMP-\d{4}-\d{6}$/;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
/** Names go into a header-free body only; still strip control characters and cap the length. */
function cleanName(name: string): string {
  const n = name.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, "").trim();
  return n === "" ? "colleague" : Array.from(n).slice(0, 80).join("");
}

/** null if the inputs are not what the database promises (fail closed: nothing is sent). */
export function buildNotificationEmail(input: NotificationInput): NotificationEmail | null {
  if (!UUID.test(input.complaintId) || !REFERENCE.test(input.reference)) return null;
  let origin: string;
  try {
    origin = new URL(input.siteUrl).origin;
  } catch {
    return null;
  }
  const link = `${origin}/lecturer/complaints/${input.complaintId}`;
  const name = cleanName(input.recipientName);
  const what =
    input.kind === "complaint_received"
      ? { subject: `New complaint ${input.reference} for you`, line: `A complaint (${input.reference}) has been sent to you on the ${SITE.name}.` }
      : { subject: `Sensitive complaint ${input.reference} needs triage`, line: `A sensitive complaint (${input.reference}) was submitted on the ${SITE.name} and is waiting for a main lecturer to review and route it.` };
  const privacy = "For privacy, this e-mail does not include the complaint itself. Sign in to read it.";
  const footer = `You receive this because you are a lecturer on the ${SITE.name} (${SITE.institution}). You can turn these e-mails off under Settings.`;

  const text = [`Dear ${name},`, "", what.line, privacy, "", `Open it: ${link}`, "", "--", footer].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f5fb;font-family:Arial,Helvetica,sans-serif;color:#14143d">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5fb;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e1e1f3">
<tr><td style="background:#252569;border-bottom:4px solid #ffba00;padding:16px 24px;color:#ffffff;font-weight:bold;font-size:16px">${escapeHtml(SITE.name)}<div style="color:#ffc526;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:normal">${escapeHtml(SITE.institution)}</div></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6">
<p style="margin:0 0 12px">Dear ${escapeHtml(name)},</p>
<p style="margin:0 0 12px">${escapeHtml(what.line)}</p>
<p style="margin:0 0 20px;color:#43438f">${escapeHtml(privacy)}</p>
<p style="margin:0 0 8px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#ffba00;color:#14143d;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">Open complaint ${escapeHtml(input.reference)}</a></p>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e1e1f3;font-size:12px;color:#6767b3">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: what.subject, text, html };
}
