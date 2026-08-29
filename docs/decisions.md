# Key Decisions (ADRs)

Short record of the important technical decisions and why they were made. New decisions get
added here so future work stays consistent.

## 1. Single Next.js app, no microservices

**Decision:** One Next.js application hosts the API, the review routes, the dashboard, and the
webhook handlers.

**Why:** MVP scale; the Sender call is the only external dependency and can be awaited inline.
Microservices add operational cost without benefit here. If sends later need to survive request
timeouts, we'd add a queue (see §7) — still within the same app.

## 2. Business is identified by the API key, never the body

**Decision:** `POST /api/review-requests` does not accept a business/tenant id.

**Why:** The key already scopes the caller to one business. Accepting a tenant id in the body
would let one business impersonate another and adds validation surface for no gain.

## 3. Store only hashes of tokens and API keys

**Decision:** `token_hash` and `key_hash` (SHA-256) are stored; raw values exist only at
generation/click time.

**Why:** A database leak then cannot be replayed to submit reviews or to send spam via the API.
Cost is a trivial lookup-by-hash query.

## 4. Rating is written by conditional UPDATE, not by read-then-write

**Decision:** `UPDATE ... SET rating=$N WHERE id=? AND rating IS NULL AND expires_at > now()`.

**Why:** Gives atomic "record exactly once" semantics without transactions/locks; concurrent
duplicate star clicks cannot overwrite. Same pattern for feedback.

## 5. Idempotency via `(business_id, order_id)` uniqueness

**Decision:** A unique constraint prevents duplicate review requests per order; retries return
the existing row. `Idempotency-Key` header support is included but optional.

**Why:** Simple, database-enforced, survives concurrent retries. Trade-off: no resend/reminder
for the same order in MVP (future feature will relax the constraint).

## 6. No status column — status is derived

**Decision:** Status (`pending` / `rated` / `completed`) is computed from timestamp columns in
queries.

**Why:** Avoids a denormalized field drifting out of sync with the timestamps it represents.

## 7. Email send is awaited inline

**Decision:** The create route sends the email synchronously before responding.

**Why:** Simplest correct behavior; on Sender failure the row already exists and the business can
retry idempotently (send re-attempted only when `email_sent_at IS NULL`). If latency becomes a
problem, move the send to a background queue in a later phase.

## 8. Email tracking uses our own routes, Sender webhooks optional

**Decision:** Opens are tracked with our 1×1 pixel; star and Google clicks are inherently tracked
by our routes. Sender account webhooks (a **paid** feature) are optional and only for
delivered/bounced.

**Why:** Keeps every event tied to the review token, works without paid features, and avoids
Sender's link-tracking wrappers on our star links. Delivery/bounce data is nice-to-have.

## 9. Google review option shown to all ratings (no gating)

**Decision:** The Google review CTA is presented after rating to every customer. Emphasis changes
by rating; access never does.

**Why:** Complies with Google's review policies by not selectively suppressing negative reviews
(see [review-flow.md](./review-flow.md) §3). Also maximizes review volume while keeping feedback
private.

## 10. Drizzle ORM

**Decision:** Drizzle + `drizzle-kit` for schema/migrations; `@neondatabase/serverless` driver.

**Why:** Lightweight (no binary/codegen), TypeScript-first, SQL-like, small migration surface for
an MVP compared to heavier ORMs.

## 11. Dashboard login: static credentials, no auth library

**Decision:** The dashboard is secured by static email + password from environment variables
(`DASHBOARD_EMAIL` / `DASHBOARD_PASSWORD`) compared server-side, followed by a signed httpOnly
session cookie (HMAC-SHA256 with `DASHBOARD_SESSION_SECRET`). No user table, no NextAuth/Auth.js,
no bcrypt.

**Why:** The MVP has a single business owner. A static credential removes a whole dependency and
table while remaining secure enough with strong-password hygiene + login rate limiting + signed
cookies. Trade-off: no per-user accounts or audit. If staff/roles are needed later, introduce an
`admins` table then — the schema path is already understood.

## 12. Rate limiting: Upstash recommended, in-memory fallback

**Decision:** Use Upstash Ratelimit in production (works across serverless instances); an
in-memory token bucket is acceptable for local dev only.

**Why:** In-memory limits are per-instance and unreliable on serverless platforms; Upstash gives
a global limiter with minimal setup.

## 13. No review-token returned to the business app

**Decision:** `POST /api/review-requests` returns the request id, not the review URL/token.

**Why:** The token belongs in the email. Returning it widens the surface for accidental exposure
and is not needed by the business app.
