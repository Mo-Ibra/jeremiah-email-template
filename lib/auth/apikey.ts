import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { authenticateApiKey } from "../db/queries";

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------
export function generateApiKey(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const raw = `rqk_${randomBytes(32).toString("base64url")}`;
  return { raw, hash: sha256Hex(raw), prefix: raw.slice(0, 8) };
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// ---------------------------------------------------------------------------
// Constant-time comparison (defense in depth)
// ---------------------------------------------------------------------------
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ---------------------------------------------------------------------------
// Extract API key from Authorization header
//   Format: "Bearer rqk_..."
// ---------------------------------------------------------------------------
export function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Authenticate a request — returns businessId or null
// ---------------------------------------------------------------------------
export async function authenticateRequest(
  request: NextRequest,
): Promise<{ keyId: string; businessId: string } | null> {
  const token = extractBearerToken(request);
  if (!token) return null;
  if (!token.startsWith("rqk_")) return null;

  const hash = sha256Hex(token);
  return authenticateApiKey(hash);
}
