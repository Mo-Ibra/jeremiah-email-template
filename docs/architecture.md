# Architecture

This document describes the system's components and how data flows between them.

## 1. Component diagram

```
┌──────────────────────────────┐
│  Existing Business App       │  (their stack, unchanged — e.g. PHP/Node/.NET)
│  knows: customer + order     │
└──────────────┬───────────────┘
               │  POST /api/review-requests
               │  Authorization: Bearer rqk_...
               │  { customerName, customerEmail, orderId, ... }
               ▼
┌──────────────────────────────┐
│  Our Review API              │  Next.js Route Handler (app/api/review-requests/route.ts)
│  - API-key auth + rate limit │
│  - validate (Zod)            │
│  - create records in Neon    │
│  - generate token            │
└──────┬───────────────┬───────┘
       │               │
       │ insert        │ POST https://api.sender.net/v2/message/send
       ▼               ▼
┌──────────────┐   ┌──────────────┐
│ Neon Postgres│   │ Sender       │  transactional email API
└──────┬───────┘   └──────┬───────┘
       │                  │ delivers
       │                  ▼
       │        ┌─────────────────────────┐
       │        │ Customer email          │  no JS; 5 star links
       │        │ /r/{token}?rating=1..5  │
       │        └─────────────┬───────────┘
       │                      │ customer clicks a star
       │                      ▼
       │        ┌─────────────────────────┐
       │        │ Next.js Review Route    │  GET /r/{token}?rating=N
       │        │ - validate token hash   │
       │        │ - record rating (once)  │
       │        │ - render follow-up      │
       │        └─────────────┬───────────┘
       ▼                      ▼
┌─────────────────────────────────────────┐
│ Neon Postgres (single DB, all state)    │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────┐
│ Dashboard (owner)            │  /dashboard/**  — static email/password login
│ metrics, filters, detail     │  /api/dashboard/**  — authorized queries
│ API-key management, settings │
└──────────────────────────────┘
```

## 2. Components and responsibilities

### 2.1 Existing Business Application (external)
- Detects that a customer should receive a review request (its own business logic, e.g.
  order delivered).
- Calls `POST /api/review-requests` on our system with the API key.
- **Never** connects to our Neon database.
- Optionally polls `GET /api/review-requests/{id}` to observe status (nice-to-have, not required
  for MVP).

### 2.2 Our Review API (Next.js Route Handler)
- Entry point: `app/api/review-requests/route.ts`.
- Authenticates the caller via `Authorization: Bearer <api_key>`.
- Identifies the business from the API key (lookup `api_keys` → `businesses`).
- Rate-limits per API key.
- Validates the payload with a shared Zod schema.
- Performs an idempotent insert (see [database.md](./database.md) and [api.md](./api.md)).
- Generates the secure review token and stores only its hash.
- Triggers the Sender email send (fire-and-await, with error handling).

### 2.3 Neon PostgreSQL
- Single database holding all state: businesses, API keys, customers, orders,
  review requests (including rating, feedback, email tracking timestamps).
- Accessed only by our app via `@neondatabase/serverless` connection pool.
- Provides atomicity for "record rating once" via conditional `UPDATE ... WHERE ... IS NULL`.

### 2.4 Sender (email delivery)
- Receives `POST https://api.sender.net/v2/message/send` from our app.
- Delivers the review email to the customer.
- (Paid feature) Can POST webhooks back to our `app/api/webhooks/sender/route.ts` for
  delivery/bounce events.
- Open/click tracking is primarily handled by **our** routes (see [sender-integration.md](./sender-integration.md)).

### 2.5 Next.js Review Route (customer-facing)
- `GET /r/[token]` — validates token hash, records rating, renders result page.
- `GET /r/[token]?rating=N` — the URL embedded in the email.
- `POST /api/reviews/feedback` — stores private feedback.
- `GET /g/[token]` — records the Google-review link click, then 302-redirects to the
  business's Google review URL.
- `GET /api/track/open` (1×1 pixel) — records email open.

### 2.6 Dashboard
- Owner-facing UI under `/dashboard/**` protected by a signed session cookie.
  Login is static email + password from env vars (no auth library, no user table).
- Reads via `/api/dashboard/**` route handlers (server-side, scoped to the business).
- Displays metrics, request list with filters/search/sort, and a detail timeline.
- Settings: business profile, Google review URL, API key generation/revocation.

## 3. Key data flows

### 3.1 Create review request (business → email)
1. Business app sends `POST /api/review-requests` with API key + payload.
2. Our API authenticates the key and resolves the business.
3. Zod validates the payload.
4. Within a transaction:
   - upsert `customers` (business, email)
   - upsert `orders` (business, external_order_id)
   - create `review_requests` with `token_hash`, `expires_at`, idempotency key
     (unique `(business_id, order_id)` makes retries idempotent).
5. Generate token → build the five star URLs.
6. Render HTML email (no JS) → `POST /message/send` to Sender.
7. Store `email_sent_at` + `sender_email_id`.
8. Return `201 { id, status: "created", createdAt }`.

### 3.2 Customer rates
1. Customer clicks a star → browser GETs `/r/{token}?rating=N`.
2. Route hashes the token, looks up `review_requests`.
3. If no row → 404 page ("This link is not valid.").
4. If expired → "expired" page.
5. Conditional update: `SET rating = N, rating_submitted_at = now()` only
   `WHERE id = ? AND rating IS NULL`. Repeats do nothing destructive.
6. Render the follow-up page: thank-you + Google review CTA (all ratings) + private feedback
   form (emphasized for low ratings).

### 3.3 Feedback
1. Customer submits feedback → `POST /api/reviews/feedback` with `{ token, feedback }`.
2. Validate + conditional update (only if rated and feedback not yet submitted).
3. Store `feedback`, `feedback_submitted_at`.

### 3.4 Google review click
1. Customer clicks "Leave a Google review" → `GET /g/{token}`.
2. Route validates token, increments `google_review_click_count`, sets
   `google_review_clicked_at` (first click), then `302` → business `google_review_url`.
3. If no URL configured, fall back to the thank-you page.

### 3.5 Email open tracking
- The email contains `<img src="https://reviews.example.com/api/track/open?t={token}">`.
- Our route returns a transparent 1×1 PNG and sets `email_opened_at` (first open only).

### 3.6 Dashboard queries
- All dashboard queries filter by `business_id` from the session's business.
- Metrics: `COUNT`, `AVG(rating)`, `GROUP BY rating`, response rate
  (`rating_submitted_at IS NOT NULL`).
- List: filters (rating, status, date range), ILIKE search on customer/order, ORDER BY
  `created_at`, LIMIT/OFFSET pagination.

## 4. Runtime model

- Stateless Next.js app on Vercel (serverless functions). The DB connection pool is
  maintained by Neon.
- Long-running work is none in MVP: the Sender call is awaited inline. (If timeouts become a
  problem, queue the send — see [decisions.md](./decisions.md) §7.)
- Scheduled cleanup is not needed for MVP (expired tokens are just rejected at read time).

## 5. Trust boundaries

| Boundary | Trust | Notes |
| --- | --- | --- |
| Business app → Review API | API key (secrets) | Business is identified by the key |
| Customer browser → Review route | Token (opaque, 256-bit) | Token hash stored; token never in logs |
| Admin browser → Dashboard | Signed session cookie | Static email/password login, business-scoped |
| Sender → our webhook (optional) | Signature/secret (if supported) | Verify before accepting events |
| Our app → Neon | Connection string (DATABASE_URL) | Stored in env only |

## 6. Deployment topology (recommended)

- **Vercel** — Next.js app (API routes, review routes, dashboard, webhooks).
- **Neon** — Postgres; single branch (production) for MVP; use preview branches for dev/staging.
- **Sender** — external; Sender API token stored in env; dashboard for sender config.
- **Environment variables** — see [development-phases.md](./development-phases.md) Phase 1.
