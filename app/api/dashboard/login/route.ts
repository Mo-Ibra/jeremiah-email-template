import { NextRequest, NextResponse } from "next/server";
import {
  createSessionPayload,
  setSessionCookie,
} from "@/lib/auth/session";

// POST /api/dashboard/login
export async function POST(request: NextRequest) {
  // Parse body
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Invalid JSON" } },
      { status: 400 },
    );
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json(
      { error: { code: "BAD_REQUEST", message: "Email and password are required" } },
      { status: 400 },
    );
  }

  // Compare against static env credentials
  const validEmail = process.env.DASHBOARD_EMAIL;
  const validPassword = process.env.DASHBOARD_PASSWORD;
  if (!validEmail || !validPassword) {
    console.error("DASHBOARD_EMAIL or DASHBOARD_PASSWORD not configured");
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Login not configured" } },
      { status: 500 },
    );
  }

  // Constant-time comparison (import inline to avoid top-level issues)
  const { timingSafeEqual } = await import("node:crypto");
  const emailMatch =
    email.length === validEmail.length &&
    timingSafeEqual(Buffer.from(email), Buffer.from(validEmail));
  const passwordMatch =
    password.length === validPassword.length &&
    timingSafeEqual(Buffer.from(password), Buffer.from(validPassword));

  if (!emailMatch || !passwordMatch) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Invalid email or password" } },
      { status: 401 },
    );
  }

  // Resolve business (by slug or first business)
  const slug = process.env.DASHBOARD_BUSINESS_SLUG;
  const { db } = await import("@/lib/db");
  const { businesses } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  let biz: { id: string } | null = null;
  if (slug) {
    biz = await db
      .select({ id: businesses.id })
      .from(businesses)
      .where(eq(businesses.slug, slug))
      .limit(1)
      .then((r) => r[0] ?? null);
  }
  if (!biz) {
    biz = await db
      .select({ id: businesses.id })
      .from(businesses)
      .limit(1)
      .then((r) => r[0] ?? null);
  }
  if (!biz) {
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "No business configured" } },
      { status: 500 },
    );
  }

  // Create session cookie
  const payload = createSessionPayload({ businessId: biz.id, email });
  const response = NextResponse.json({ ok: true });
  return setSessionCookie(response, payload);
}
