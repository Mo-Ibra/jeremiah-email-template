import { NextRequest } from "next/server";
import { hashToken } from "@/lib/token";
import { findRequestByTokenHash, recordGoogleClick } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const req = await findRequestByTokenHash(hashToken(token));
  if (!req) {
    return new Response("Not found", { status: 404 });
  }

  // Record the click (idempotent — increments count)
  await recordGoogleClick(req.request);

  // Redirect to the business's Google review URL
  const url = req.business.googleReviewUrl;
  if (!url) {
    return new Response("Google review URL not configured", { status: 404 });
  }

  return Response.redirect(url, 302);
}
