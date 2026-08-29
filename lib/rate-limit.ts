// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (per-instance, dev/MVP only)
// For production, use Upstash Ratelimit or similar.
// ---------------------------------------------------------------------------

type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

// Cleanup every 60s to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000);

/**
 * Check rate limit for a given key.
 * @param key       unique identifier (e.g. IP, API key hash)
 * @param limit     max requests per window
 * @param windowMs  window duration in ms
 * @returns         { allowed, remaining, retryAfter }
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, retryAfter: 0 };
}
