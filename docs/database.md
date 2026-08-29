# Database

Neon PostgreSQL schema for the Review & Feedback System (MVP).

- Stack: Neon serverless Postgres, accessed via `@neondatabase/serverless`.
- ORM: Drizzle ORM (`drizzle-orm/neon-http`) with `drizzle-kit` for migrations.
- All timestamps are `timestamptz`.
- All primary keys are `uuid` generated with `gen_random_uuid()` (pgcrypto/built-in).

## 1. ERD (text)

```
businesses 1 ─── * api_keys
businesses 1 ─── * customers
customers  1 ─── * orders
orders     1 ─── * review_requests
businesses 1 ─── * review_requests
```

```
businesses
  ├─ api_keys (API keys issued to the business app)
  ├─ customers
  │     └─ orders
  │           └─ review_requests
  └─ review_requests
```

> **Note:** there is no `admins` table. Dashboard login uses **static email + password
> configured via environment variables** (no auth library, no user table). See
> [security.md](./security.md) §7.

## 2. Tables

### 2.1 `businesses`

The account that owns review requests and the dashboard.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text NOT NULL | Business name |
| `slug` | text UNIQUE NOT NULL | Stable identifier used in dashboard URLs |
| `google_review_url` | text NULL | Owner-configured Google review deep link |
| `created_at` | timestamptz NOT NULL | default `now()` |
| `updated_at` | timestamptz NOT NULL | default `now()` |

### 2.2 `api_keys`

API keys issued to the business's application. **Only a SHA-256 hash of the key is stored.**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `business_id` | uuid NOT NULL FK → businesses(id) | |
| `name` | text NOT NULL | e.g. "Production", "Staging" |
| `prefix` | text NOT NULL | First 8 chars of the key, for display/identification |
| `key_hash` | text UNIQUE NOT NULL | `sha256(key)` |
| `status` | text NOT NULL DEFAULT 'active' | CHECK in ('active','revoked') |
| `last_used_at` | timestamptz NULL | Updated on successful auth |
| `revoked_at` | timestamptz NULL | Set when revoked |
| `created_at` | timestamptz NOT NULL | |

### 2.3 `customers`

Deduplicated customers per business.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `business_id` | uuid NOT NULL FK → businesses(id) | |
| `name` | text NOT NULL | Provided by business |
| `email` | text NOT NULL | Provided by business |
| `created_at` | timestamptz NOT NULL | |

UNIQUE constraint: `(business_id, email)` — one customer row per email per business.

### 2.4 `orders`

Order references from the business app. No order processing happens here.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `business_id` | uuid NOT NULL FK → businesses(id) | |
| `customer_id` | uuid NOT NULL FK → customers(id) | |
| `external_order_id` | text NOT NULL | Business's own order id |
| `order_date` | timestamptz NULL | Optional |
| `metadata` | jsonb NOT NULL DEFAULT '{}' | Arbitrary business data, size-limited |
| `created_at` | timestamptz NOT NULL | |

UNIQUE constraint: `(business_id, external_order_id)`.

### 2.5 `review_requests`

Core entity: one row per review email sent. Rating, feedback, and email-tracking fields live here.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `business_id` | uuid NOT NULL FK → businesses(id) | Denormalized for querying/filtering |
| `customer_id` | uuid NOT NULL FK → customers(id) | |
| `order_id` | uuid NOT NULL FK → orders(id) | |
| `token_hash` | text UNIQUE NOT NULL | `sha256(token)` — token never stored raw |
| `idempotency_key` | text NULL | Optional client-supplied key |
| `rating` | smallint NULL | CHECK rating BETWEEN 1 AND 5 |
| `feedback` | text NULL | Private feedback text |
| `rating_submitted_at` | timestamptz NULL | Set when a star is clicked |
| `feedback_submitted_at` | timestamptz NULL | Set when feedback is saved |
| `google_review_clicked_at` | timestamptz NULL | First Google-link click |
| `google_review_click_count` | int NOT NULL DEFAULT 0 | Total Google-link clicks |
| `email_sent_at` | timestamptz NULL | |
| `email_delivered_at` | timestamptz NULL | From Sender webhook (optional) |
| `email_bounced_at` | timestamptz NULL | From Sender webhook (optional) |
| `email_opened_at` | timestamptz NULL | From our open-pixel route |
| `sender_email_id` | text NULL | `emailId` returned by Sender `/message/send` |
| `expires_at` | timestamptz NOT NULL | Default `now() + interval '30 days'` |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

UNIQUE constraints:
- `token_hash` (unique)
- `(business_id, order_id)` — the primary idempotency guard
- `(business_id, idempotency_key)` — partial UNIQUE `WHERE idempotency_key IS NOT NULL`

**Status is derived, not stored** (avoids drift):

```sql
CASE
  WHEN rating_submitted_at IS NULL THEN 'pending'
  WHEN feedback_submitted_at IS NULL THEN 'rated'
  ELSE 'completed'
END AS status
```

## 3. Indexes

```
-- token lookup (fast review-route resolution)
CREATE UNIQUE INDEX idx_review_requests_token_hash ON review_requests (token_hash);

-- dashboard list: newest first, business-scoped
CREATE INDEX idx_review_requests_business_created
  ON review_requests (business_id, created_at DESC);

-- dashboard filters
CREATE INDEX idx_review_requests_business_rating
  ON review_requests (business_id, rating);
CREATE INDEX idx_review_requests_business_status
  ON review_requests (business_id, rating_submitted_at);  -- null = pending

-- API-key auth
CREATE UNIQUE INDEX idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX idx_api_keys_business ON api_keys (business_id);

-- customer/order lookups
CREATE INDEX idx_customers_business_email ON customers (business_id, email);
CREATE INDEX idx_orders_business_external ON orders (business_id, external_order_id);
```

## 4. Important constraints

- `rating` is `smallint` with `CHECK (rating BETWEEN 1 AND 5)`.
- `api_keys.status` has `CHECK (status IN ('active','revoked'))`.
- `review_requests.rating` is immutable once set (enforced by conditional UPDATE, not a DB
  trigger — see below). Optionally add a trigger `rating_immutable` for hard safety.
- `(business_id, order_id)` uniqueness guarantees at most one review request per order (MVP).
  A future "resend" feature will relax this.
- Foreign keys cascade rules: `ON DELETE CASCADE` is **not** used for production data;
  prefer `RESTRICT` (default) so nothing is silently deleted. Seed/cleanup scripts must be explicit.

## 5. "Record rating exactly once" guarantee

The rating write is a conditional update, so concurrent/duplicate star clicks cannot
overwrite:

```sql
UPDATE review_requests
   SET rating = $1, rating_submitted_at = now(), updated_at = now()
 WHERE id = $2
   AND rating IS NULL
   AND expires_at > now()
RETURNING id;
```

- If a row is returned → first submission (proceed to follow-up page).
- If no row and the request exists → already rated → render the result page for the stored rating.

Optional hardening: a trigger that raises if `rating` changes after being set.

## 6. Data access layer

- Drizzle schema mirrors these tables (`lib/db/schema.ts`).
- Queries used by routes:
  - `createReviewRequest(...)` — transactional insert (customers, orders, review_requests).
  - `findRequestByTokenHash(hash)` — join to customer/order/business.
  - `recordRating(id, rating)` — conditional UPDATE above.
  - `recordFeedback(id, text)` — conditional UPDATE (`WHERE feedback_submitted_at IS NULL`).
  - `recordOpen(id)`, `recordGoogleClick(id)`, `recordSenderEvent(id, event)`.
  - Dashboard: `metrics(businessId)`, `listRequests(businessId, filters)`, `getRequest(id)`.

## 7. Seed data (development)

A `lib/db/seed.ts` script creates:

1. A demo `businesses` row (e.g. "Demo Café", slug `demo`).
2. A demo `api_keys` row (hash of a generated `rqk_...` key) — the raw key is printed once.
3. Sample `customers` / `orders` / `review_requests` for exercising dashboard filters.

Dashboard login credentials are **not** seeded — they come from env vars
(`DASHBOARD_EMAIL` / `DASHBOARD_PASSWORD`).

Seed is only run in dev/staging. Never run against production without explicit intent.

## 8. Migrations

- `drizzle-kit generate` → SQL migration files in `migrations/`.
- Applied via `drizzle-kit migrate` (local) and in CI/release pipeline for production.
- The initial migration (`0001_initial.sql`) contains all tables + indexes + seed-friendly
  defaults.
