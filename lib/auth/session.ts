import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Session cookie helpers
//   Payload: { businessId, email, exp }
//   Cookie format: <base64url(payload)>.<hmac-sha256-signature>
// ---------------------------------------------------------------------------

const COOKIE_NAME = "session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type SessionPayload = {
  businessId: string;
  email: string;
  exp: number;
};

// ---------------------------------------------------------------------------
// Sign
// ---------------------------------------------------------------------------
export function signSession(payload: SessionPayload): string {
  const secret = getSecret();
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

// ---------------------------------------------------------------------------
// Verify
//   Returns the payload if the signature is valid and not expired, else null.
// ---------------------------------------------------------------------------
export function verifySession(token: string): SessionPayload | null {
  const secret = getSecret();
  if (!secret) return null;

  const dot = token.indexOf(".");
  if (dot === -1) return null;

  const encoded = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");

  const sigA = Buffer.from(providedSig);
  const sigB = Buffer.from(expectedSig);
  if (sigA.length !== sigB.length) return null;
  if (!timingSafeEqual(sigA, sigB)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(encoded, "base64url").toString(),
    ) as SessionPayload;
    if (typeof data.exp !== "number" || Date.now() >= data.exp * 1000) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Set the session cookie on a NextResponse (idiomatic Next.js API)
// ---------------------------------------------------------------------------
export function setSessionCookie(
  response: NextResponse,
  payload: SessionPayload,
): NextResponse {
  const token = signSession(payload);
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
  });
  return response;
}

// ---------------------------------------------------------------------------
// Read + verify the cookie from a Request
//   Returns null if missing / invalid / expired
// ---------------------------------------------------------------------------
export function getSessionFromRequest(
  request: Request,
): SessionPayload | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));

  if (!match) return null;

  const token = match.slice(COOKIE_NAME.length + 1);
  return verifySession(token);
}

// ---------------------------------------------------------------------------
// Create a session payload (convenience)
// ---------------------------------------------------------------------------
export function createSessionPayload(opts: {
  businessId: string;
  email: string;
}): SessionPayload {
  return {
    businessId: opts.businessId,
    email: opts.email,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// Secret — return "" when not configured so auth fails closed (no throw)
// ---------------------------------------------------------------------------
function getSecret(): string {
  return process.env.DASHBOARD_SESSION_SECRET ?? "";
}
