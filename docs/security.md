# Security

Security design and abuse-prevention for the Review & Feedback System.

## 1. Threat model (what we protect against)

| Threat | Mitigation |
| --- | --- |
| Unauthorized creation of review requests | API key auth + rate limiting |
| Guessing another customer's review link | 256-bit random tokens, hashed at rest |
| Reusing a review link to change a rating | Conditional single-write updates |
| Overwriting/duplicating ratings | Atomic `WHERE ... IS NULL` updates |
| Mass spam of API endpoint | Per-key rate limiting |
| Dashboard hijacking | Signed httpOnly session cookie, login rate limiting, business scoping |
| DB leak exposing tokens | Only hashes stored (`token_hash`, `key_hash`) |
| Customer PII leakage | Emails/phones never in URLs; strict validation; not logged |
| Sender webhook spoofing | Verify origin (signature/secret or shared token header) |
| SSRF / injection via metadata | JSON-schema validation, length limits, no URL fetching |
| Brute-forcing the dashboard | Rate-limit login attempts |

## 2. API key authentication

- Keys: `rqk_live_<43 random base64url chars>` (256 bits of entropy).
- **Storage:** only `sha256(key)` is stored (`api_keys.key_hash`), plus a `prefix` (first 8
  chars) for display. The raw key is shown once at creation, then unrecoverable.
- **Check:** hash the presented key → lookup `key_hash` → require `status = 'active'` →
  resolve business. Update `last_used_at` (throttled).
- Constant-time comparison is unnecessary when comparing hashes (the stored value is itself a
  hash), but use a constant-time compare anyway for hygiene.
- Revocation is immediate (status flip). Keep a small cache with TTL if key lookups become hot.
- Env-var keys (e.g. a default key) are **not** supported in MVP; all keys are DB rows.

## 3. Review token generation & usage

- **Entropy:** `crypto.randomBytes(32)` → base64url (≈ 43 chars, 256 bits). Unguessable.
- **Storage:** only `sha256(token)` in `review_requests.token_hash` (UNIQUE index). A DB leak
  does not expose usable tokens.
- **Lookup:** hash incoming token → equality on `token_hash`. Index-backed.
- **Single-purpose:** the token is only ever used for its one review request; it grants read of
  the request + the ability to submit rating/feedback/click tracking for that request.
- **Never logged:** tokens must not appear in server logs, error messages, or Sentry breadcrumbs.
  Log only the request id.

### Token expiration

- `expires_at` defaults to `now() + 30 days`.
- Expired tokens render an "expired" page; updates are guarded with `expires_at > now()`.

### Preventing token guessing

- 256-bit entropy makes brute force infeasible.
- Rate limiting on public routes: cap requests per token AND per IP (see §5) to slow any
  automated probing.
- Do not reveal *which* token was wrong — always return the same generic 404 page.

## 4. Preventing duplicate / tampered submissions

- Rating: `UPDATE ... SET rating=$N WHERE id=? AND rating IS NULL AND expires_at > now()`.
  Atomic; concurrent clicks cannot double-write.
- Feedback: `WHERE feedback_submitted_at IS NULL`.
- Repeated "already rated" hits just render the result page (no error, no overwrite).
- Token cannot be swapped between customers: the token is bound to a row that itself is bound to
  a specific customer/order/business.

## 5. Rate limiting

Public endpoints (business API + customer routes):

- **Business API** `POST /api/review-requests`: 60 req/min per API key (token bucket). Also a
  modest per-IP cap as a second layer.
- **Rating route** `/r/{token}`: e.g. 20 req/min per token + 120 req/min per IP.
- **Feedback POST**: 10 req/min per token.
- **Login:** 5 attempts per minute per IP + per email.

Implementation:
- **Recommended:** Upstash Ratelimit (global across serverless instances).
- **MVP fallback (local/dev):** in-memory token bucket (single instance) — acceptable for
  development, replaced before production.
- Exceeding → `429` with `Retry-After`.

## 6. Input validation

- All request bodies validated with shared **Zod** schemas (`lib/validation.ts`).
- Email: RFC-valid format, ≤ 254 chars.
- Names: ≤ 200 chars, trimmed.
- Order id: ≤ 255 chars, trimmed, no HTML.
- Metadata: JSON object, ≤ 8 KB, flat, no `__proto__`-style keys (Zod `record` with safe keys).
- Feedback: 2–2000 chars, trimmed.
- Query params (`rating`): strict whitelist `1..5`.
- Reject oversized bodies early (route-level body size check).

## 7. Dashboard authorization

The dashboard uses **static credentials configured in the environment** — no auth library and no
user table.

- **Credentials:** `DASHBOARD_EMAIL` + `DASHBOARD_PASSWORD` env vars. No bcrypt, no
  `admins` table. Use a strong password and rotate it periodically.
- **Login:** `POST /api/dashboard/login` compares submitted email/password against the env
  values using a constant-time comparison (`crypto.timingSafeEqual`), then sets a signed
  session cookie.
- **Session cookie:** httpOnly, `Secure`, `SameSite=Lax`, short expiry (e.g. 7 days). The cookie
  value is a payload (`{ businessId, email, exp }`) signed with HMAC-SHA256 using
  `DASHBOARD_SESSION_SECRET`. Verify signature + expiry on every request.
- **Login rate limit** (see §5). Generic error on bad credentials (no user enumeration).
- **Scoping:** the cookie stores the `businessId`; every dashboard query filters by it. The id is
  taken from the session, never from the client. With a single business for the MVP, resolve the
  business id at login from `DASHBOARD_BUSINESS_SLUG` (or fall back to the first business row).
- **UI routes:** protected by middleware that verifies the cookie and redirects
  unauthenticated users to `/dashboard/login`.
- **Trade-off (accepted for MVP):** static credentials mean one shared login for all dashboard
  users of a business. No per-user audit. If multiple staff/roles are needed later, replace with
  per-user accounts (which is the reason a future `admins` table would be added).

## 8. Protecting customer information

- Emails, phones, and order metadata are **never** placed in URLs. Only opaque tokens.
- Emails/names are only rendered in the dashboard (authenticated) and in the outgoing email.
- No PII in logs: log request ids, not emails. Configure logging scrubbing if a hosted logger is
  used.
- Caching: don't cache public pages that echo customer PII. Rating/thanks pages are
  uncacheable or private.
- Webhook handler must not echo webhook payloads into logs.
- Data minimization: `orderMetadata` is stored but not displayed by default.

## 9. Sender webhook security (optional)

- If Sender supports a shared secret/signature on webhooks, verify it. Otherwise require a
  custom `X-Webhook-Secret` header matching a server-side secret and restrict to Sender's IP
  range if documented.
- Reject and return `400` on missing/invalid secret. Respond `200` fast; do heavy work after
  responding (or keep work trivial).

## 10. General hardening (release checklist)

- [ ] HTTPS everywhere; HSTS on the deployed domain.
- [ ] No secrets in client components / `.env` in repo. `.env` gitignored.
- [ ] `next lint` + `tsc` clean; strict TypeScript on.
- [ ] Zod validation on every input surface (API, feedback, query params).
- [ ] SQL via parameterized queries (Drizzle) — no string interpolation of user input.
- [ ] Headers: `X-Content-Type-Options: nosniff`, `Referrer-Policy`, CSP for dashboard pages.
- [ ] Tokens hashed at rest; keys hashed at rest; raw values never logged.
- [ ] Rate limits applied on public endpoints; login brute-force protection.
- [ ] Dependencies scanned (npm audit) in CI.
- [ ] No `/api/*` route renders anything that could leak another business's data (every query
      business-scoped).
