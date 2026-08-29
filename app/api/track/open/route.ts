import { NextRequest, NextResponse } from "next/server";
import { hashToken } from "@/lib/token";
import { findRequestByTokenHash, recordOpen } from "@/lib/db/queries";

export const runtime = "nodejs";

// 1x1 transparent PNG
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

// ---------------------------------------------------------------------------
// GET /api/track/open?t={token}
//   Email open tracking pixel. Records email_opened_at (first open only)
//   and returns a 1x1 transparent PNG. Never throws for invalid tokens.
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t");

  if (token) {
    const req = await findRequestByTokenHash(hashToken(token));
    if (req) {
      // Fire-and-forget is fine, but await is cheap and keeps ordering
      await recordOpen(req.request);
    }
  }

  return new NextResponse(TRANSPARENT_PNG, {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(TRANSPARENT_PNG.length),
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
