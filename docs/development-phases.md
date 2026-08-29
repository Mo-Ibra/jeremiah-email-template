# Development Phases

Implementation roadmap. Build in order; each phase gates the next. Keep everything aligned with
the other docs: [database](./database.md), [api](./api.md), [resend](./resend-integration.md),
[review-flow](./review-flow.md), [dashboard](./dashboard.md), [security](./security.md).

**Suggested project structure** (referenced throughout):

```
app/
  api/
    review-requests/route.ts
    review-requests/[id]/route.ts        (optional status check)
    reviews/feedback/route.ts
    track/open/route.ts                  (open pixel)
    webhooks/resend/route.ts             (optional)
    dashboard/...                        (metrics, list, detail, keys, settings)
  r/[token]/page.tsx                     (rating + result page)
  g/[token]/route.ts                     (google redirect)
  dashboard/...                          (login, overview, requests, [id], settings)
  layout.tsx, globals.css
components/
  review/... (stars, result, feedback)
  dashboard/... (charts, table, filters)
lib/
  db/schema.ts, db/index.ts, db/queries.ts, db/seed.ts
  auth/apikey.ts, auth/session.ts
  resend/client.ts
  email/render.ts
  token.ts
  validation.ts
  rate-limit.ts
migrations/
env.example
```

---

## Phase 1 — Project setup

**Goal:** A working Next.js + TypeScript app that compiles, lints, and runs locally with Neon
connected.

**What will be built**
- Scaffold Next.js (App Router) + TypeScript.
- ESLint + Prettier + strict TS config.
- Drizzle ORM + `drizzle-kit` wired to Neon (`DATABASE_URL`).
- `env.example` with all variables (see below). `.env` gitignored.
- Health check route (`GET /api/health`) that verifies DB connectivity.
- Base layout, globals, and a minimal home page.

**Files/components likely involved**
- `app/api/health/route.ts`, `app/layout.tsx`, `app/page.tsx`
- `lib/db/index.ts`, `lib/db/schema.ts` (empty placeholders initially)
- `drizzle.config.ts`, `tsconfig.json`, `.eslintrc.json`, `package.json`

**API/database changes**
- None beyond a read-only `SELECT 1` health check.
- Neon project created; `DATABASE_URL` configured.

**Dependencies**
- `next`, `react`, `typescript`, `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`,
  `zod`, `eslint`, `prettier`.

**Acceptance criteria**
- `npm run dev`, `npm run build`, `npm run lint` all pass.
- `/api/health` returns `{ ok: true }` with live Neon connection.
- `env.example` lists every variable the project needs.

**Before next phase:** clean build, lint, and a confirmed Neon connection.

---

## Phase 2 — Database and data model

**Goal:** The full schema from [database.md](./database.md) exists and is migrated.

**What will be built**
- Drizzle schema (`lib/db/schema.ts`) mirroring: `businesses`, `api_keys`,
  `customers`, `orders`, `review_requests`.
- All unique/index/check constraints and the conditional-update queries.
- `drizzle-kit generate` → initial migration → applied to Neon.
- Seed script (`lib/db/seed.ts`) with a demo business, admin, key, customers, orders, requests.

**Files/components likely involved**
- `lib/db/schema.ts`, `migrations/0001_initial.sql`, `lib/db/seed.ts`, `lib/db/queries.ts`
  (write the rating/feedback/click guard queries here).

**API/database changes**
- All tables created. No API routes yet.

**Dependencies**
- Phase 1 (drizzle + neon). No new packages.

**Acceptance criteria**
- Migration applies cleanly to a fresh Neon DB.
- `rating` CHECK, key status CHECK, uniqueness on token_hash / (business_id, order_id) enforced.
- Seed runs and produces consistent data.
- Guard queries (`recordRating` etc.) behave correctly: first call updates, second call no-ops.

**Before next phase:** schema + guards are tested at the query level.

---

## Phase 3 — Authentication and API keys

**Goal:** API keys exist and are validated; dashboard login works with static credentials.

**What will be built**
- `lib/auth/apikey.ts`: `hashKey`, `generateApiKey`, `authenticateApiKey(headers)`.
- API-key CRUD helpers (create/revoke/list) used later by the dashboard.
- `lib/auth/session.ts`: sign/verify an HMAC-signed httpOnly session cookie
  (payload `{ businessId, email, exp }`, HMAC-SHA256 with `DASHBOARD_SESSION_SECRET`).
- `POST /api/dashboard/login`: compare submitted email/password against
  `DASHBOARD_EMAIL` / `DASHBOARD_PASSWORD` (constant-time compare), set the session cookie.
- Dashboard login page + route protection middleware.
- Login rate limiting.

**Files/components likely involved**
- `lib/auth/apikey.ts`, `lib/auth/session.ts`
- `app/api/dashboard/login/route.ts`, `app/dashboard/login/page.tsx`
- `middleware.ts` (protect `/dashboard/**`), `lib/rate-limit.ts`

**API/database changes**
- Reads/writes on `api_keys`. No user table — dashboard credentials come from env vars.
  No public endpoints yet.

**Dependencies**
- `zod`, Phase 1–2. (No auth library, no bcrypt — static credentials + signed cookie.)

**Acceptance criteria**
- Generating a key stores only `key_hash` + `prefix`; the raw key is returned once.
- `authenticateApiKey` resolves business for a valid active key; rejects missing/invalid/revoked.
- Logging in with `DASHBOARD_EMAIL`/`DASHBOARD_PASSWORD` sets a session cookie; wrong
  credentials fail with a generic error.
- Session cookie is httpOnly + signed; expired/tampered cookies are rejected.
- `/dashboard/**` redirects unauthenticated users to login.

**Before next phase:** key auth + dashboard session both verified manually.

---

## Phase 4 — Review request API

**Goal:** `POST /api/review-requests` fully works, is idempotent, and validated.

**What will be built**
- Route handler `POST /api/review-requests`:
  - Bearer auth via `authenticateApiKey`.
  - Zod validation of payload.
  - Transactional upsert of customer/order + insert review_request with `token_hash`,
    `expires_at`, `idempotency_key`.
  - Idempotent behavior: duplicate `orderId` returns existing request (`200`, `duplicate:true`).
  - Error responses per [api.md](./api.md) (§2 Error responses).
  - Business-scoped rate limiting on the key.
- (Optional) `GET /api/review-requests/[id]` status endpoint.

**Files/components likely involved**
- `app/api/review-requests/route.ts`, `app/api/review-requests/[id]/route.ts`
- `lib/validation.ts` (shared Zod schemas), `lib/token.ts` (generate + hash)

**API/database changes**
- Inserts into `customers`, `orders`, `review_requests`; rate-limit store.
- New public endpoint.

**Dependencies**
- Phase 2 (schema), Phase 3 (auth), `zod`. No new packages.

**Acceptance criteria**
- `201` on create with correct body; `200 duplicate` on retry of same order.
- `400/401/429/500` paths return the documented error shape.
- Idempotency holds even under concurrent duplicate calls (unique index prevents dupes).
- `token` is never returned or logged.

**Before next phase:** API tested with curl/POSTman covering success + all error cases.

---

## Phase 5 — Resend email integration

**Goal:** Review emails are sent through Resend with the no-JS star links.

**What will be built**
- `lib/resend/client.ts`: wrapper around `POST /emails` (Bearer token).
- `lib/email/render.ts`: HTML template (from the existing template as the design start),
  plain-text fallback, star links, open pixel.
- Hook the send into the Phase 4 route: render template, send, persist `sender_email_id` +
  `email_sent_at`. Guard re-send when `email_sent_at IS NOT NULL`; regenerate the token on retry
  when the email was never sent.
- Resend webhook handler + webhook creation (free). Verify Svix signature; make idempotent.
  Correlate per [resend-integration.md](./resend-integration.md) §5.

**Files/components likely involved**
- `lib/resend/client.ts`, `lib/email/render.ts`,
  `app/api/webhooks/resend/route.ts` (optional)

**API/database changes**
- Writes `email_sent_at`, `sender_email_id`, and (webhook) `email_delivered_at` /
  `email_bounced_at`.
- New webhook endpoint (optional).

**Dependencies**
- Phase 4, Resend account + API key, verified sender address.

**Acceptance criteria**
- A real email is delivered to a test inbox; stars are clickable plain links in Gmail/Apple
  Mail/Outlook.
- No JS in the email; template passes a render test (e.g. `email-validator` or manual).
- `email_sent_at` + `sender_email_id` persisted; retry logic skips resend when already sent.
- Webhook (if enabled) updates delivery columns and is idempotent.

**Before next phase:** end-to-end email received and verified in multiple clients.

---

## Phase 6 — Review/rating flow

**Goal:** Star clicks record the rating once and render the follow-up page.

**What will be built**
- `GET /r/[token]` server page:
  - Hash token → lookup (join business/customer/order).
  - Invalid → 404 page; expired → expired page; no `rating` param → neutral page with stars.
  - Valid `rating=1..5` → conditional `recordRating` → render result page.
  - Already rated → render stored rating, never overwrite.
- Open-pixel route `GET /api/track/open?t={token}` returning a transparent PNG; sets
  `email_opened_at` once.

**Files/components likely involved**
- `app/r/[token]/page.tsx`, `app/api/track/open/route.ts`
- `components/review/RatingPage.tsx`, `components/review/StarInput.tsx`

**API/database changes**
- Uses `recordRating` guard query; new public routes.

**Dependencies**
- Phase 2 (guard query), Phase 5 (links now real). No new packages.

**Acceptance criteria**
- Clicking each star records the correct rating exactly once.
- Re-clicking any star shows the result page for the stored rating (no change).
- Invalid/expired tokens show the right messages; generic 404 (no enumeration).
- Open pixel sets `email_opened_at` on first load only.
- Manual test: full email → click star → page reflects rating.

**Before next phase:** rating capture verified end-to-end via a real email link.

---

## Phase 7 — Feedback flow

**Goal:** Customers can submit private feedback; it persists and is flagged.

**What will be built**
- `POST /api/reviews/feedback` with `{ token, feedback }`:
  - Validate (token + 2–2000 char feedback), guards (exists, not expired, rated, not submitted).
  - Conditional `recordFeedback` → `feedback_submitted_at`.
  - Idempotent `200` on repeat.
- Feedback form on the result page (works with JS fetch **and** plain form POST fallback).

**Files/components likely involved**
- `app/api/reviews/feedback/route.ts`
- `components/review/FeedbackForm.tsx`

**API/database changes**
- Writes `feedback`, `feedback_submitted_at`.

**Dependencies**
- Phase 6. No new packages.

**Acceptance criteria**
- Feedback saves; repeated submissions no-op with `200`.
- Feedback before rating is rejected (`400`).
- Form works with JS enabled and disabled (progressive enhancement).

**Before next phase:** feedback flow verified manually.

---

## Phase 8 — Dashboard

**Goal:** Owner can view, search, filter, sort, and inspect all review requests.

**What will be built**
- Overview page: KPIs, average rating, distribution, recent requests (`/api/dashboard/metrics`).
- Requests list with filters (rating/status/date), search (customer/order), sort, pagination
  (`/api/dashboard/requests`).
- Request detail page with full record + timeline (`/api/dashboard/requests/[id]`).
- Settings page: business name, Google review URL, API key management (create/list/revoke).

**Files/components likely involved**
- `app/dashboard/(overview)/page.tsx`, `app/dashboard/requests/page.tsx`,
  `app/dashboard/requests/[id]/page.tsx`, `app/dashboard/settings/page.tsx`
- `app/api/dashboard/...` handlers; `components/dashboard/*` (table, filters, chart)

**API/database changes**
- New dashboard API endpoints (all business-scoped from session).
- Reads only.

**Dependencies**
- Phase 3 (session/auth), Phase 2 (queries). No new packages.

**Acceptance criteria**
- All required columns from [dashboard.md](./dashboard.md) §2 are visible.
- Filters, search, sort, pagination all work and are business-scoped.
- Detail page shows the full timeline; settings can save Google URL and manage keys.
- Metrics match hand-verified SQL results.

**Before next phase:** dashboard reviewed against the requirements list.

---

## Phase 9 — Tracking and analytics

**Goal:** Email opens, Google clicks, and aggregate analytics are complete and consistent.

**What will be built**
- `GET /g/[token]` Google redirect route: increment `google_review_click_count`, set
  `google_review_clicked_at` on first click, `302` to `google_review_url` (graceful fallback).
- Make the Google review CTA on the result page point at `/g/{token}`.
- Wire delivery/bounce columns via Resend webhook (Phase 5 optional) into the timeline.
- Finalize overview analytics (CTR to Google, response rate).

**Files/components likely involved**
- `app/g/[token]/route.ts`, `components/review/GoogleReviewCta.tsx`
- updates to `app/dashboard` + queries.

**API/database changes**
- New public redirect route; updates on click-count columns.

**Dependencies**
- Phase 6–8. No new packages.

**Acceptance criteria**
- Google link click recorded once + counted on repeat; redirect lands on Google.
- No URL configured → graceful page (no crash).
- Overview shows Google click-through metrics consistent with raw rows.

**Before next phase:** tracking verified; no data drift between counters and rows.

---

## Phase 10 — Security and validation hardening

**Goal:** Apply [security.md](./security.md) release checklist; close remaining gaps.

**What will be built**
- Full rate limiting on all public endpoints (Upstash if available, else documented in-memory).
- Login brute-force protection; generic login errors.
- Logging hygiene: no tokens/PII in logs; request-id-based logging.
- Response headers (nosniff, referrer-policy, CSP for dashboard).
- Body-size limits; strict query-param validation everywhere.
- npm audit + CI lint/typecheck job.

**Files/components likely involved**
- `lib/rate-limit.ts`, `lib/validation.ts`, `middleware.ts`, `next.config.js`
- CI config (GitHub Actions).

**API/database changes**
- None structural; rate-limit store + config.

**Dependencies**
- Phases 4–9 (all surfaces exist to harden). Optionally `@upstash/ratelimit`.

**Acceptance criteria**
- Every public endpoint rate-limited; 429s return `Retry-After`.
- No tokens/emails appear in logs under normal operation.
- Login throttled; no user enumeration.
- Automated lint/typecheck in CI is green.

**Before next phase:** security checklist from [security.md](./security.md) §10 fully ticked.

---

## Phase 11 — Testing

**Goal:** Automated coverage of the critical paths.

**What will be built**
- Unit tests: token gen/hash, validation schemas, idempotency logic, guard-query behavior (with a
  Neon test branch or testcontainers).
- Integration tests: `POST /api/review-requests` (201/200-duplicate/400/401/429), feedback,
  rating route (once-only), google redirect.
- Optional: Playwright smoke test of dashboard login + list + detail.
- Seeded Neon test database; tests isolated per run.

**Files/components likely involved**
- `tests/` or colocated `*.test.ts`; `vitest.config.ts` (recommended), `playwright.config.ts`

**API/database changes**
- None (test-only fixtures).

**Dependencies**
- `vitest`, `supertest`/fetch-based integration, optionally `playwright`. Phases 1–10.

**Acceptance criteria**
- Core flows covered and green in CI.
- Idempotency + "rate once" tested with duplicate/concurrent calls.
- Dashboard endpoints tested for business-scoping (no cross-business leakage).

**Before next phase:** CI green; coverage report reviewed.

---

## Phase 12 — Deployment

**Goal:** Production deployment on Vercel + Neon; env configured.

**What will be built**
- Vercel project + production build; env vars set (all from `env.example`).
- Neon production database with migrations applied (not seed).
- Custom domain / HTTPS; HSTS.
- Optional: staging deployment on a Neon preview branch.
- Production smoke test of the full flow (create → email → rate → feedback → dashboard).

**Files/components likely involved**
- Vercel project config, deployment pipeline, runbook notes.

**API/database changes**
- None (infrastructure).

**Dependencies**
- Phases 1–11; Vercel + Neon accounts; Resend production key + verified sender.

**Acceptance criteria**
- Deployed app serves health, API, review routes, and dashboard over HTTPS.
- Real end-to-end run works in production.
- Rollback plan documented (Vercel redeploy + DB migration revert if needed).

**Before next phase:** production smoke test passed.

---

## Phase 13 — Integration with the existing business website

**Goal:** The business app is wired up and live.

**What will be built**
- Provide the business team the integration spec ([api.md](./api.md)) + examples (Node/PHP).
- Generate a production API key; hand it over securely (secrets manager).
- Coordinate rollout: business calls the API at the right moment (e.g. order delivered).
- Verify a real production order produces an email, rating, and dashboard rows.
- Support: monitoring dashboard (Vercel analytics + optional Sentry), alert on `500`s.

**Files/components likely involved**
- Documentation deliverable; no app code changes expected (unless gaps surface).

**API/database changes**
- None (unless integration reveals a spec change → update [api.md](./api.md) first).

**Dependencies**
- Phase 12; business team availability.

**Acceptance criteria**
- Business app successfully creates requests in production; duplicate calls are idempotent.
- Full loop confirmed on real data: email sent, rating recorded once, feedback stored, dashboard
  reflects everything, Google clicks tracked.
- Any discovered gaps are logged and scheduled.

---

## Cross-phase notes

- **Keep schema stable:** lock Phase 2 schema before Phase 4; migrations after are additive.
- **Seed vs prod:** seeds only in dev/staging; production gets migrations only.
- **Naming:** keep route/column names as documented to avoid doc drift.
- **Each phase is a PR-sized unit** with tests where specified; update docs when behavior changes.
