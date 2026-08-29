# Requirements

This document defines the scope of the Review & Feedback System (MVP). It is the source of
truth for what will be built and, just as importantly, what will **not** be built.

## 1. Context

The client business already has a website/application where customers place orders. They want
to automatically ask customers for a review after an order, capture private feedback, surface
satisfaction data in a dashboard, and direct satisfied customers to a Google review — in a way
that complies with Google's review policies.

The review system is a **separate application**. The existing business application must not
require direct access to the Neon database. Communication happens over a small, authenticated
HTTP API.

## 2. Goals (functional requirements)

### 2.1 Review request creation (business → system)

- `POST /api/review-requests` accepts:
  - `customerName` (string, required)
  - `customerEmail` (string, required, valid email)
  - `orderId` (string, required)
  - optional `orderDate`, `customerPhone`, `orderMetadata` (JSON object)
- The request is authenticated with an API key issued to the business.
- The business is identified by the API key, not by a field in the payload.
- The system must:
  1. Validate the request.
  2. Upsert the customer and order records.
  3. Create a review request with a unique, unguessable token.
  4. Send the review email via Sender.
  5. Return the review request id and status.
- Retries of the same request must not create duplicate review requests
  (idempotency, see [api.md](./api.md)).

### 2.2 Email review request

- Email is sent by our system via Sender (transactional API).
- The email contains five star ratings as **plain URLs**, no JavaScript:
  `https://reviews.example.com/r/<token>?rating=1..5`
- The email renders correctly in common email clients (table layout, inline styles).
- The existing HTML email template is the design starting point.

### 2.3 Rating capture

- Clicking a star opens `GET /r/<token>?rating=N` in our app.
- The system validates the token, records the rating exactly once, and shows the
  appropriate follow-up page.
- Already-submitted links are handled idempotently (no overwrite, no error spam).

### 2.4 Feedback capture

- Customers can submit private feedback text after rating.
- Feedback is stored and visible in the dashboard.
- A submitted feedback flag per review request is tracked.

### 2.5 Google review flow (compliant)

- After rating, the customer is offered a link to leave a Google review.
- The system must **not** implement review gating that selectively sends only positive
  customers to Google. The Google review option is presented to customers regardless of the
  rating they gave. It may be presented more prominently for high ratings, but it must never
  be withheld because a rating was low (see [review-flow.md](./review-flow.md) §3).
- Google review link clicks are tracked when possible (via a redirect through our domain).

### 2.6 Dashboard

The business owner can see per review request:
- Customer name, customer email, order ID
- Selected rating (1–5) and whether it was given
- Private feedback and whether it was submitted
- Date/time (created, rated, feedback submitted)
- Status (pending / rated / completed — derived)
- Whether the rating link was clicked
- Whether feedback was submitted
- Whether the Google review link was clicked (and how many times)

Dashboard capabilities:
- Aggregate metrics: total requests, average rating, rating distribution, response rate
- Filter by rating, status, date range
- Search by customer name / email / order ID
- Sort newest/oldest
- Pagination
- Detail view per request with a full timeline

## 3. Non-functional requirements

| Requirement | Constraint |
| --- | --- |
| Performance | Rating click → response should be fast (< 300 ms server-side); dashboard queries index-backed |
| Security | See [security.md](./security.md); tokens must be unguessable, keys hashed at rest |
| Privacy | Customer emails/names never appear in URLs; only opaque tokens |
| Availability | Stateless app; Neon serverless pool; Sender as external email service |
| Maintainability | TypeScript end-to-end, shared Zod schemas, typed queries |
| Cost | MVP budget: Neon free tier, Sender free/entry tier, Vercel hobby |

## 4. Assumptions

- There is a single business to serve for the MVP, but the data model allows multiple
  businesses without schema changes.
- The business can create a Sender API token and (if desired) enable Sender webhooks.
- The business can provide its Google review deep link (e.g.
  `https://search.google.com/local/writereview?placeid=<PLACE_ID>`) to configure in the dashboard.
- The existing HTML email template exists and will be ported into the app as a React/template
  file. (If not yet available, the template in [email-flow.md](./email-flow.md) is the fallback.)
- Deployment target is Vercel + Neon (regionally colocated).

## 5. Non-goals (explicitly out of scope for MVP)

- Review **gating** / selective Google review routing (prohibited, see §2.5).
- Rating editing by the customer after submission.
- Sending reminders / resending review emails for the same order.
- Managing orders, products, or refunds (that stays in the business app).
- Multiple dashboard roles / RBAC beyond a single admin.
- Bulk email campaigns or newsletters via our system.
- Integrations with Google Places API to fetch/verify the Google review URL (owner pastes it).
- Machine learning / sentiment analysis of feedback.
- Mobile apps.

## 6. Acceptance criteria (system level)

1. A business backend can create a review request with one authenticated call; a duplicate call
   returns the same review request (idempotent).
2. The customer receives an email with five working star links; no JS is required.
3. Clicking a star records the rating once and shows a follow-up page.
4. Private feedback can be submitted and appears in the dashboard.
5. The Google review link is offered regardless of rating, never selectively withheld, and its
   clicks are recorded.
6. The dashboard lists all requests with the requested columns, filters, search, sort, and detail.
7. Tokens are unguessable, expire, and cannot be reused to change a recorded rating.
8. Unauthorized API calls (missing/invalid/revoked key) are rejected with proper errors.
9. The system is deployed end-to-end (see [development-phases.md](./development-phases.md)).
