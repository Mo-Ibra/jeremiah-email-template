# Review & Feedback System — Documentation

Technical blueprint for a standalone customer review and feedback system.

## What this is

A separate application that collects customer reviews and private feedback for a business
that already runs its own website / order system. The business's existing application does
**not** touch our database. It calls **one** authenticated API endpoint to create a review
request; everything else (email, rating capture, feedback, Google review links, dashboard,
analytics) is handled by this system.

## Stack (MVP)

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript |
| Database | Neon PostgreSQL (serverless) |
| ORM / migrations | Drizzle ORM + `drizzle-kit` |
| Email | Resend (`https://api.resend.com`) |
| Dashboard auth | Static email + password (env-configured), signed httpOnly session cookie |
| API auth (business → us) | API keys (`Authorization: Bearer <key>`) |
| Validation | Zod |
| Rate limiting | Upstash Ratelimit (recommended) / in-memory (MVP fallback) |
| Deployment | Vercel (recommended) + Neon |

## High-level flow

```
Existing Business App
        │  POST /api/review-requests  (API key)
        ▼
Our Review API (Next.js Route Handler)
        │  insert + token
        ▼
Neon PostgreSQL
        │  send via Resend
        ▼
Customer email (star links, no JS)
        │  customer clicks a star
        ▼
Next.js Review Route  /r/{token}?rating=N
        │  validate token, record rating
        ▼
Neon PostgreSQL
        │
        ▼
Feedback form  +  Google review link  +  Dashboard
```

## Documentation map

| File | Purpose |
| --- | --- |
| [README.md](./README.md) | This overview |
| [requirements.md](./requirements.md) | Scope, functional & non-functional requirements, assumptions, non-goals |
| [architecture.md](./architecture.md) | Architecture, component responsibilities, data flows |
| [database.md](./database.md) | Schema, tables, indexes, constraints, ERD, seed data |
| [api.md](./api.md) | API spec for the business integration |
| [email-flow.md](./email-flow.md) | Email lifecycle, template structure, links |
| [resend-integration.md](./resend-integration.md) | Resend specifics: API, webhooks, tracking |
| [review-flow.md](./review-flow.md) | Rating, feedback, and Google-compliant review flow |
| [dashboard.md](./dashboard.md) | Dashboard features, queries, filters, sorting |
| [security.md](./security.md) | Auth, tokens, rate limiting, abuse prevention |
| [development-phases.md](./development-phases.md) | Phase-by-phase implementation roadmap |
| [decisions.md](./decisions.md) | Key technical decisions and their rationale |

## Key conventions used throughout these docs

- **Placeholder domain:** `https://reviews.example.com` (set via `PUBLIC_BASE_URL`).
- **API key format:** `rqk_<43-char random>` (only a SHA-256 hash is stored).
- **Review token:** 32 random bytes, base64url-encoded; only the SHA-256 hash is stored.
- **Review link:** `https://reviews.example.com/r/<token>?rating=1..5`
- **Business identity** is derived from the API key, never from the request body.
- **Single tenant by default**, but the schema supports multiple `businesses` with no rework.

### Environment variables (full set)

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string |
| `PUBLIC_BASE_URL` | App base URL, e.g. `https://reviews.example.com` |
| `RESEND_API_KEY` | Resend API key (Bearer, `re_...`) |
| `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` | Verified sender used in emails |
| `RESEND_WEBHOOK_SECRET` | Resend webhook signing secret (Svix) |
| `DASHBOARD_EMAIL` / `DASHBOARD_PASSWORD` | Static dashboard login credentials |
| `DASHBOARD_SESSION_SECRET` | Secret for signing the dashboard session cookie |
| `DASHBOARD_BUSINESS_SLUG` | Business the dashboard operates on (fallback: first business) |

## MVP principles

- No microservices. One Next.js app + Neon + Resend.
- Business app only needs `POST /api/review-requests` (plus an optional status check).
- Email must work without JavaScript (plain `<a href>` star links).
- Google review links are offered to **every** customer who rates; negative ratings are
  **never** selectively hidden from the Google review flow (see [review-flow.md](./review-flow.md)).
- Keep the schema lean; no event-sourcing, no message queues.

## Getting started pointers

1. Read [architecture.md](./architecture.md) and [requirements.md](./requirements.md) first.
2. Follow [development-phases.md](./development-phases.md) as the build order.
3. Use [database.md](./database.md) to create the Neon schema.
4. Use [api.md](./api.md) and [resend-integration.md](./resend-integration.md) when wiring the
   business integration and email.
