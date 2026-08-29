# Review Flow

The customer-facing flow: rating, private feedback, and the Google review link.

## 1. Routes

| Route | Purpose |
| --- | --- |
| `GET /r/[token]` | Landing / fallback page (no rating in URL) |
| `GET /r/[token]?rating=N` | The URL embedded in the email; records the rating |
| `POST /api/reviews/feedback` | Store private feedback |
| `GET /g/[token]` | Record Google-review click, then redirect to Google |

All public routes are read-mostly; the only writes are the rating record, feedback record, and
click counters — each is a guarded single-row update.

## 2. Rating capture (`GET /r/[token]?rating=N`)

Request flow in `app/r/[token]/page.tsx` (server component / route handler):

1. Validate `rating` is one of `1..5`; otherwise render the neutral landing page.
2. Hash the incoming token (`sha256`) → look up `review_requests` (join customer, order,
   business).
3. Branch:
   - **Not found** → `404` page: "This review link is not valid."
   - **Expired** (`expires_at < now()`) → "expired" page.
   - **Not yet rated** → conditional UPDATE
     `SET rating=$N, rating_submitted_at=now() WHERE id=? AND rating IS NULL AND expires_at > now()`.
     - Row returned → this is the first submission → proceed with the fresh rating.
     - No row → concurrent/duplicate click → load the stored rating (see next branch).
   - **Already rated** → do **not** overwrite; load the stored rating and render its result page.
4. Render the result page for the (effective) rating.

The conditional update gives an atomic "rate exactly once" guarantee (see
[database.md](./database.md) §5).

### Landing page (no rating)

If someone opens `/r/{token}` without a `rating` param (e.g. from the "I didn't order" footer),
show a neutral page with the five star links again. It records nothing until a star is clicked.

## 3. Follow-up page by rating — Google-compliant design

> **Policy requirement:** do **not** implement review gating that sends only positive customers
> to Google while hiding it from negative ones. Google's policies prohibit suppressing negative
> feedback. Our design offers the Google review option to **every** customer who rates.

Design used here:

- **All ratings (1–5):** after rating, the customer sees a "Thank you" page that includes the
  Google review CTA **regardless of rating**.
- **Prominence, not gating:** for ratings 4–5 the Google CTA is the primary button; for ratings
  1–3 the CTA is still present but the page leads with the private feedback form. The Google
  review option is never withheld.
- Rationale: this collects honest ratings, lets unhappy customers vent privately, and drives all
  customers to Google reviews. It does not selectively suppress anyone.

Page contents:

1. Heading: "Thanks, {customerName}!" (+ the star rating they gave, read-only).
2. Private feedback form (see §4) — always available, prominent for low ratings:
   "Tell us what we could improve." (for 1–3) / "Anything else you'd like to share?" (for 4–5).
3. Google review CTA:
   - 4–5: primary button "Leave a review on Google".
   - 1–3: secondary button "Leave a review on Google" (same link, always shown).
4. "Submit feedback" and "Maybe later" actions.

This is the same page structure for all ratings; only emphasis changes. No rating is ever barred
from the Google link.

## 4. Private feedback (`POST /api/reviews/feedback`)

Body:

```json
{ "token": "<token>", "feedback": "The coffee was great but the wait was long." }
```

Behavior:

1. Hash token → find request.
2. Guards: request exists; not expired; a rating exists (`rating_submitted_at IS NOT NULL`);
   feedback not yet submitted.
3. Conditional UPDATE `SET feedback=$text, feedback_submitted_at=now()`
   `WHERE id=? AND feedback_submitted_at IS NULL`.
4. Respond `200 { ok: true }`. If already submitted, still `200` (idempotent) with
   `{ ok: true, alreadySubmitted: true }`.
5. Feedback length limit: 2–2000 characters. Trimmed.

The form uses a plain HTML form + `fetch` from our own page (JS enhancement) with a **no-JS
fallback**: a normal `<form method="post">` that posts to the endpoint (we accept both). The
email itself never relies on JS — only the optional follow-up form does.

## 5. Google review link (`GET /g/[token]`)

1. Hash token → find request (join business).
2. If `businesses.google_review_url` is set:
   - Increment `google_review_click_count`, set `google_review_clicked_at` (only first click
     sets the timestamp; count always increments).
   - `302` redirect to the Google review URL.
3. If no URL configured → render a friendly page ("We'll be ready for your review soon") or
   redirect to the thank-you page.

The business owner sets `google_review_url` in the dashboard (e.g.
`https://search.google.com/local/writereview?placeid=<PLACE_ID>`).

## 6. State transitions

```
pending ──(star click)──► rated ──(feedback submit)──► completed
   │                          │
   └─(expires)──► expired     └─(google click, optional side effect)
```

- `pending`: no rating yet.
- `rated`: rating recorded; feedback not yet submitted.
- `completed`: feedback submitted.
- Google review click is tracked independently and does not change status.

## 7. Edge cases

| Case | Behavior |
| --- | --- |
| Star clicked twice (same link) | Recorded once; page shows stored rating |
| Star clicked then another star | No overwrite; first rating stands |
| Token invalid/unknown | 404 "invalid link" |
| Token expired | "expired" page |
| Feedback submitted twice | Second call no-ops; `200` |
| Feedback before rating | Rejected (`400`) |
| Email client strips query string | Link still opens `/r/{token}`; neutral page shown |
| Google URL not configured | Graceful page; no crash |
