import { createHash, randomBytes } from "node:crypto";

// ---------------------------------------------------------------------------
// Review token
//   - 32 random bytes, base64url-encoded (≈43 chars, 256 bits entropy)
//   - Only the SHA-256 hash is stored (token_hash)
//   - The raw token lives only in the email link: /r/<token>?rating=N
// ---------------------------------------------------------------------------

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
