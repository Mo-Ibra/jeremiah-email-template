import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getBusiness, updateBusiness } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
      { status: 401 },
    );
  }

  const business = await getBusiness(session.businessId);
  if (!business) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Business not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    name: business.name,
    slug: business.slug,
    googleReviewUrl: business.googleReviewUrl ?? "",
  });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
      { status: 401 },
    );
  }

  let body: { name?: string; googleReviewUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Body must be JSON" } },
      { status: 400 },
    );
  }

  const data: { name?: string; googleReviewUrl?: string | null } = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Name cannot be empty" } },
        { status: 422 },
      );
    }
    data.name = name;
  }
  if (body.googleReviewUrl !== undefined) {
    data.googleReviewUrl = body.googleReviewUrl.trim() || null;
  }

  const updated = await updateBusiness(session.businessId, data);
  if (!updated) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Business not found" } },
      { status: 404 },
    );
  }

  return NextResponse.json({
    name: updated.name,
    slug: updated.slug,
    googleReviewUrl: updated.googleReviewUrl ?? "",
  });
}
