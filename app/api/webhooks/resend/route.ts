import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import {
  recordSenderEvent,
  recordSenderEventByEmail,
} from "@/lib/db/queries";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/webhooks/resend
//   Resend webhook handler (free, built-in — see docs/resend-integration.md).
//
//   Signed with Svix (headers: svix-id, svix-timestamp, svix-signature).
//   Payload: { type: "email.delivered", data: { email_id, to, ... } }
//   Events are delivered at-least-once; our column updates are guarded so
//   duplicates don't overwrite. Ack with 200 or Resend retries.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const bodyText = await request.text();

  // 1. Verify Svix signature if a secret is configured
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    try {
      const wh = new Webhook(secret);
      wh.verify(bodyText, {
        "svix-id": request.headers.get("svix-id") ?? "",
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      });
    } catch {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  // 2. Parse payload
  let payload: { type?: string; data?: Record<string, unknown> };
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const type = payload.type ?? "";
  const data = payload.data ?? {};

  const emailId = data.email_id ? String(data.email_id) : null;
  const email = Array.isArray(data.to) ? String(data.to[0]) : null;

  // 3. Update delivery/bounce state (idempotent)
  if (type === "email.delivered") {
    if (emailId) await recordSenderEvent(emailId, "delivered");
    else if (email) await recordSenderEventByEmail(email, "delivered");
  } else if (type === "email.bounced" || type === "email.complained") {
    if (emailId) await recordSenderEvent(emailId, "bounced");
    else if (email) await recordSenderEventByEmail(email, "bounced");
  }
  // email.opened / email.clicked are covered by our own routes
  // (open pixel + star links + Google link), so they're intentionally ignored.

  return NextResponse.json({ ok: true });
}
