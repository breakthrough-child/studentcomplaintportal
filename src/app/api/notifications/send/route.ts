import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { parseCronSecret } from "@/lib/env/schema";
import { sendPendingNotifications } from "@/lib/notifications/send";

/**
 * Scheduled retry of queued notification e-mails (for example a Vercel Cron job or any scheduler calling
 * GET with "Authorization: Bearer <CRON_SECRET>"). Disabled (404) unless CRON_SECRET is set. E-mails are
 * normally sent right after each submission; this only catches up on failures and SMTP outages.
 */
export async function GET(request: NextRequest) {
  const secret = parseCronSecret(process.env);
  if (!secret) return new NextResponse("Not found", { status: 404 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const result = await sendPendingNotifications(50);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
