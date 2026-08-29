import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/apikey";
import { rateLimit } from "@/lib/rate-limit";
import { generateToken, hashToken } from "@/lib/token";
import {
  createReviewRequestSchema,
  isMetadataWithinLimit,
} from "@/lib/validation";
import {
  createReviewRequest,
  getReviewRequestForEmail,
  updateRequestToken,
  markEmailSent,
} from "@/lib/db/queries";
import { renderReviewEmail } from "@/lib/email/render";
import { sendReviewEmail, ResendError } from "@/lib/resend/client";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/review-requests
//   Auth: Bearer <api_key>   (business identified by the key, never the body)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  // 1. Authenticate
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
      { status: 401 },
    );
  }

  // 2. Rate limit (per API key)
  const rl = rateLimit(`apikey:${auth.keyId}`, 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests",
          retryAfter: rl.retryAfter,
        },
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  // 3. Parse body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: { code: "VALIDATION_ERROR", message: "Malformed JSON body", details: [] },
      },
      { status: 400 },
    );
  }

  // 4. Validate payload
  const parsed = createReviewRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request payload",
          details: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            issue: i.message,
          })),
        },
      },
      { status: 400 },
    );
  }

  const body = parsed.data;

  // 5. Metadata size limit
  if (!isMetadataWithinLimit(body.orderMetadata)) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "orderMetadata exceeds 8 KB",
          details: [{ field: "orderMetadata", issue: "too large" }],
        },
      },
      { status: 400 },
    );
  }

  // 6. Create the review request (idempotent)
  const token = generateToken();
  const tokenHash = hashToken(token);
  const idempotencyKey = request.headers.get("Idempotency-Key");

  const result = await createReviewRequest({
    businessId: auth.businessId,
    tokenHash,
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    customerPhone: body.customerPhone ?? null,
    orderId: body.orderId,
    orderDate: body.orderDate ? new Date(body.orderDate) : null,
    orderMetadata: body.orderMetadata ?? null,
    idempotencyKey,
  });

  // 7. Fetch details needed for the email
  const reqDetail = await getReviewRequestForEmail(result.id);
  if (!reqDetail) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Internal server error" } },
      { status: 500 },
    );
  }

  // 8. Send the email if not already sent (guards against resend)
  if (!reqDetail.emailSentAt) {
    let sendToken = token;
    if (result.status === "duplicate") {
      // Email was never sent, so the old token was never exposed.
      // Regenerate so we can embed it in a fresh email.
      sendToken = generateToken();
      await updateRequestToken(result.id, hashToken(sendToken));
    }

    const { subject, html, text } = renderReviewEmail({
      token: sendToken,
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
      // NEVER log the token or the request body. Log only status/message.
      if (err instanceof ResendError) {
        console.error(
          `[review-requests] email send failed (status=${err.status}) for request=${result.id}`,
        );
      } else {
        console.error(
          `[review-requests] email send unexpected error for request=${result.id}`,
        );
      }
      return NextResponse.json(
        {
          error: {
            code: "EMAIL_SEND_FAILED",
            message: "Review request created but the email could not be sent",
          },
        },
        { status: 500 },
      );
    }
  }

  // 9. Respond
  if (result.status === "duplicate") {
    return NextResponse.json(
      {
        id: result.id,
        status: "created",
        createdAt: reqDetail.createdAt,
        duplicate: true,
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      id: result.id,
      status: "created",
      createdAt: reqDetail.createdAt,
    },
    { status: 201 },
  );
}
