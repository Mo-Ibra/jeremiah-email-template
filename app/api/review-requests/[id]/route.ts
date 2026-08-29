import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/apikey";
import { getReviewRequestStatus } from "@/lib/db/queries";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// GET /api/review-requests/[id]
//   Auth: Bearer <api_key>   (status check for the business)
// ---------------------------------------------------------------------------
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/review-requests/[id]">,
) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid API key" } },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;

  const result = await getReviewRequestStatus(auth.businessId, id);
  if (!result) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Review request not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
