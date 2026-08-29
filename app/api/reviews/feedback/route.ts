import { NextRequest, NextResponse } from "next/server";
import { hashToken } from "@/lib/token";
import { feedbackSchema } from "@/lib/validation";
import { findRequestByTokenHash, recordFeedback } from "@/lib/db/queries";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body must be valid JSON" } },
      { status: 400 },
    );
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parsed.error.issues,
        },
      },
      { status: 422 },
    );
  }

  const { token, feedback } = parsed.data;

  // Look up by token hash
  const req_row = await findRequestByTokenHash(hashToken(token));
  if (!req_row) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Invalid review token" } },
      { status: 404 },
    );
  }

  // Must have a rating before submitting feedback
  if (!req_row.request.rating) {
    return NextResponse.json(
      { error: { code: "RATING_REQUIRED", message: "Rate us before leaving feedback" } },
      { status: 422 },
    );
  }

  // Already submitted feedback — idempotent
  if (req_row.request.feedbackSubmittedAt) {
    return NextResponse.json(
      { id: req_row.request.id, status: "already_submitted" },
      { status: 200 },
    );
  }

  // Record feedback (conditional update; idempotent)
  const updated = await recordFeedback(req_row.request, feedback);
  if (!updated) {
    // Race condition: another request got there first — treat as already submitted
    return NextResponse.json(
      { id: req_row.request.id, status: "already_submitted" },
      { status: 200 },
    );
  }

  return NextResponse.json(
    { id: updated.id, status: "submitted" },
    { status: 201 },
  );
}
