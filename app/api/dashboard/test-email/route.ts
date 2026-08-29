import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/token";
import {
  createReviewRequest,
  getReviewRequestForEmail,
  markEmailSent,
} from "@/lib/db/queries";
import { renderReviewEmail } from "@/lib/email/render";
import { sendReviewEmail, ResendError } from "@/lib/resend/client";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // 1. Session auth
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
      { status: 401 },
    );
  }

  // 2. Parse body
  let body: { customerName?: string; customerEmail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Body must be JSON" } },
      { status: 400 },
    );
  }

  const name = body.customerName?.trim();
  const email = body.customerEmail?.trim();
  if (!name || !email) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "customerName and customerEmail required" } },
      { status: 422 },
    );
  }

  // 3. Create review request
  const token = generateToken();
  const tokenHash = hashToken(token);
  const orderId = `TEST-${Date.now()}`;

  const result = await createReviewRequest({
    businessId: session.businessId,
    tokenHash,
    customerName: name,
    customerEmail: email,
    customerPhone: null,
    orderId,
    orderDate: null,
    orderMetadata: null,
    idempotencyKey: null,
  });

  // 4. Fetch email details
  const reqDetail = await getReviewRequestForEmail(result.id);
  if (!reqDetail) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Internal server error" } },
      { status: 500 },
    );
  }

  // 5. Send email
  const { subject, html, text } = renderReviewEmail({
    token,
    customerName: reqDetail.customerName,
    businessName: reqDetail.businessName,
  });

  try {
    const { emailId } = await sendReviewEmail({
      fromEmail: process.env.RESEND_FROM_EMAIL ?? "",
      fromName: process.env.RESEND_FROM_NAME ?? reqDetail.businessName,
      toEmail: reqDetail.customerEmail,
      toName: reqDetail.customerName,
      subject,
      html,
      text,
      reviewRequestId: result.id,
    });
    await markEmailSent(result.id, emailId);
  } catch (err) {
    if (err instanceof ResendError) {
      console.error(
        `[test-email] send failed (status=${err.status}) for request=${result.id}`,
      );
    } else {
      console.error(
        `[test-email] unexpected error for request=${result.id}`,
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "EMAIL_SEND_FAILED",
          message: "Review request created but email failed to send",
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { id: result.id, status: "sent", to: email },
    { status: 201 },
  );
}
