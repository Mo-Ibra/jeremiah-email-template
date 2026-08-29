# Dashboard

Owner-facing dashboard for the Review & Feedback System.

- Path: `/dashboard/**` (protected by a signed session cookie).
- Data API: `/api/dashboard/**` (server-side, scoped to the session's business).
- Login: static email + password configured via environment variables (no auth library, no
  user table). See [security.md](./security.md) §7.

## 1. Pages

| Page | Path | Purpose |
| --- | --- | --- |
| Overview | `/dashboard` | KPIs, average rating, distribution chart, recent requests |
| Requests | `/dashboard/requests` | Filterable/sortable/searchable table of all requests |
| Request detail | `/dashboard/requests/[id]` | Full record + timeline |
| Settings | `/dashboard/settings` | Business name, Google review URL, API key management |
| Login | `/dashboard/login` | Admin sign-in |

## 2. Request list — columns (from [requirements.md](./requirements.md) §2.6)

| Column | Source |
| --- | --- |
| Customer name | `customers.name` |
| Customer email | `customers.email` |
| Order ID | `orders.external_order_id` |
| Selected rating | `review_requests.rating` (— when none) |
| Private feedback | `review_requests.feedback` (preview + full in detail) |
| Rating submitted? | `rating_submitted_at` not null |
| Feedback submitted? | `feedback_submitted_at` not null |
| Google review clicked? | `google_review_clicked_at` not null (+ count) |
| Status | derived (pending / rated / completed) |
| Created at | `created_at` |
| Updated at | `updated_at` |
| Email state | sent / opened / delivered / bounced (from tracking columns) |

## 3. Filters, search, sort

- **Rating filter:** 1, 2, 3, 4, 5 (or "unrated").
- **Status filter:** pending / rated / completed.
- **Date range:** created between A and B (date pickers, timezone = business-local).
- **Search:** ILIKE on `customers.name`, `customers.email`, `orders.external_order_id`.
- **Sort:** newest first (default) / oldest first by `created_at`.
- **Pagination:** page-based (LIMIT/OFFSET, default 25/page).

Query shape (`listRequests`):

```sql
SELECT r.id, r.rating, r.created_at, r.feedback, c.name AS customer_name,
       c.email AS customer_email, o.external_order_id,
       r.rating_submitted_at, r.feedback_submitted_at,
       r.google_review_clicked_at, r.google_review_click_count,
       CASE
         WHEN r.rating_submitted_at IS NULL THEN 'pending'
         WHEN r.feedback_submitted_at IS NULL THEN 'rated'
         ELSE 'completed'
       END AS status
  FROM review_requests r
  JOIN customers c ON c.id = r.customer_id
  JOIN orders o     ON o.id = r.order_id
 WHERE r.business_id = $1
   AND (r.rating = $2 OR $2 IS NULL)
   AND (date_trunc('day', r.created_at) >= $3 OR $3 IS NULL)
   AND (date_trunc('day', r.created_at) <= $4 OR $4 IS NULL)
   AND ($5 = '' OR c.name ILIKE '%'||$5||'%'
                   OR c.email ILIKE '%'||$5||'%'
                   OR o.external_order_id ILIKE '%'||$5||'%')
 ORDER BY r.created_at $6
 LIMIT $7 OFFSET $8;
```

## 4. Overview KPIs (`metrics`)

- **Total review requests** — `COUNT(*)`.
- **Rated** — `COUNT(rating IS NOT NULL)`.
- **Response rate** — `rated / total`.
- **Average rating** — `AVG(rating)` (over rated).
- **Rating distribution** — `GROUP BY rating ORDER BY rating`.
- **Status breakdown** — pending / rated / completed counts.
- **Google click-through** — requests where `google_review_clicked_at` not null.
- **Recent requests** — last 10 by `created_at DESC`.

Example distribution query:

```sql
SELECT rating, COUNT(*) AS n
  FROM review_requests
 WHERE business_id = $1 AND rating IS NOT NULL
 GROUP BY rating ORDER BY rating;
```

## 5. Request detail page

Shows everything about one review request:

- Customer name, email, order id, order date, metadata (read-only JSON).
- Rating with timestamps (rating submitted at).
- Full private feedback (read-only) + submitted-at.
- Status badge.
- Google review click status + count + the configured Google URL.
- Email timeline (sent / opened / delivered / bounced timestamps, sender email id).
- Audit-friendly created/updated times.

Timeline widget renders ordered events: Request created → Email sent → Email opened →
Rating submitted → Feedback submitted → Google review clicked.

## 6. Settings page

- Business name, slug (read-only after creation), Google review URL (editable).
- **API keys:** list (name, prefix, status, last used, created), create new (show raw key once),
  revoke. See [api.md](./api.md) §5.
- Danger zone (MVP): none — no deletion endpoints in MVP to avoid accidental data loss.

## 7. Auth & authorization

- Login via `/dashboard/login` → POST to `/api/dashboard/login`, compares against static
  credentials from env (`DASHBOARD_EMAIL` / `DASHBOARD_PASSWORD`), then sets a signed httpOnly
  session cookie.
- All `/api/dashboard/**` handlers verify the session cookie and scope queries to the business
  identified by the session.
- No cross-business data access.
- See [security.md](./security.md) §7 for details.

## 8. Dashboard implementation notes

- Server components for list/detail; a small client component only for filter controls and the
  (optional) JS enhancement on the feedback form.
- Charts: a tiny inline bar chart (pure CSS) for rating distribution — no chart library needed
  for MVP.
- Empty states: friendly copy when no requests match filters.
- Loading/error states standard across pages.
