# Email Flow

End-to-end email lifecycle for review requests.

## 1. When an email is sent

A review email is sent automatically as part of `POST /api/review-requests`, immediately after
the review request row is created.

Order of operations in the route handler:

1. Insert customer/order/review_request (transaction).
2. Generate token → build star URLs.
3. Render the HTML template (see §4).
4. `POST https://api.resend.com/emails` (see [resend-integration.md](./resend-integration.md)).
5. Persist `sender_email_id`, `email_sent_at`.

## 2. What data is passed to the email

| Data | Source |
| --- | --- |
| `customerName` | `customers.name` (from API payload) |
| Star URLs (5) | `https://reviews.example.com/r/{token}?rating=1..5` |
| Business name | `businesses.name` |
| Unsubscribe/preferences (optional) | Resend-managed, or a mailto/help link |
| Open tracking pixel | `https://reviews.example.com/api/track/open?t={token}` |

**Never** put the raw token, customer email, phone, or order metadata into the email in a way
that exposes them beyond the star links themselves. The star URL already contains the token,
which is safe (opaque, single-purpose).

## 3. The five star links

Rendered as plain anchors inside a table (email-safe, no JavaScript):

```
<td><a href="https://reviews.example.com/r/{token}?rating=1">★</a></td>
<td><a href="https://reviews.example.com/r/{token}?rating=2">★★</a></td>
...
```

Each link is a full absolute URL. Email clients that block JS have no impact — plain links work
everywhere.

## 4. HTML email template

The existing HTML email template is the **design starting point**. Port it into the app as a
plain string template (`lib/email/render.ts` — `renderReviewEmail()`).

Required template requirements:

- **No JavaScript** (no `<script>`, no on* attributes).
- **Inline CSS only**; use `<table>` layout; `width`/`bgcolor` attributes for Outlook.
- MSO-safe: avoid flexbox/grid in critical layout.
- Preview text (`<span style="display:none">...`) recommending the customer to rate.
- Header with business name.
- Body: "Hi {customerName}, how was your order?".
- Five star buttons as table cells with generous tap targets.
- Small footer: why they got this email, and a "I didn't order" / contact link
  (which routes to a `GET /r/{token}` with no rating → neutral page; does not record data).
- Hidden 1×1 tracking pixel at the bottom.
- `alt` attributes on any images; fallback text on stars for text-only clients
  (also provide a plain-text `text` version of the email).

Fallback text version:

```
Hi {customerName},

How was your order with {businessName}?

Rate us: 1 (https://.../r/{token}?rating=1) ... 5 (https://.../r/{token}?rating=5)

Thank you!
```

## 5. Email subjects (copy starting points)

- "How was your order, {customerName}?"
- "We'd love your feedback, {customerName}"

Configure per business later if needed; hardcode a default for MVP.

## 6. Email event tracking

| Event | Source | Stored on |
| --- | --- | --- |
| Sent | Return of `POST /emails` | `email_sent_at`, `sender_email_id` |
| Opened | Our tracking pixel (`/api/track/open`) | `email_opened_at` |
| Star clicked | Our `/r/{token}` route | `rating_submitted_at` |
| Google link clicked | Our `/g/{token}` route | `google_review_clicked_at`, `..._count` |
| Delivered / bounced | Resend webhooks (free) | `email_delivered_at` / `email_bounced_at` |

Why our own pixel instead of Resend's link tracking for opens: it keeps every event tied to the
review request token and avoids redirect wrappers on our star links. Resend webhooks provide
delivered/bounced.

## 7. Retry / failure handling (MVP)

- If `POST https://api.resend.com/emails` fails: mark the review request as created but `email_sent_at` NULL;
  return `500 EMAIL_SEND_FAILED`. Log the error.
- The business can simply retry `POST /api/review-requests`; the idempotent insert returns the
  same row, and the route re-attempts the send (guard: only retry send when
  `email_sent_at IS NULL`).
- No automatic retry/cron in MVP.

## 8. Email template rendering checklist

- [ ] Renders identically in Gmail, Apple Mail, Outlook (Windows), and a text client.
- [ ] Stars are `<a>` elements (not buttons that need JS).
- [ ] Links are absolute (full domain), HTTPS.
- [ ] Tracking pixel present; `email_opened_at` set only on first hit.
- [ ] Preview text + `alt` texts present.
- [ ] Template is parameterized: `{customerName}`, `{businessName}`, `{starUrl1..5}`, `{openPixel}`.
