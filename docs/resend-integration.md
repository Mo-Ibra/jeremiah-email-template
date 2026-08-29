# Resend Integration

Details for sending review emails through [Resend](https://resend.com) and tracking events.

## 1. Prerequisites

- A Resend account.
- An API key: **https://resend.com/api-keys** (format `re_...`). Store it as
  `RESEND_API_KEY` in env — server-side only.
- A verified sender address (add a domain or use the shared `*.resend.dev` for testing).
  Store as `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME`.
- Webhooks are **free** and built-in (unlike some marketing platforms).

## 2. Base URL and auth

- Base URL: `https://api.resend.com`
- Header: `Authorization: Bearer re_...`
- `Content-Type: application/json`
- HTTPS only.

## 3. Sending the review email

Endpoint: `POST https://api.resend.com/emails`

Payload built by `lib/resend/client.ts` (`sendReviewEmail()`):

```json
{
  "from": "Example Cafe <reviews@example.com>",
  "to": ["angela@example.com"],
  "subject": "How was your order, Angela?",
  "html": "<html>... star links ...</html>",
  "text": "... plain text fallback ...",
  "headers": {
    "X-Review-Request-Id": "018f....-uuid"
  },
  "tags": [
    { "name": "review_request_id", "value": "018f....-uuid" }
  ]
}
```

Success response (from Resend):

```json
{ "id": "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794" }
```

Persist `id` → `review_requests.sender_email_id`, and `email_sent_at = now()`.

Notes:
- `from` is the combined `Name <email>` string.
- The HTML is our fully-rendered template string (see [email-flow.md](./email-flow.md) §4).
- Always provide `text` (plain-text fallback).
- Custom `headers`/`tags` carry the review request id so webhooks can correlate.
- Attachments are not used in the MVP.

### Code shape

```ts
// lib/resend/client.ts
export async function sendReviewEmail(input: {
  fromEmail: string; fromName: string;
  toEmail: string; toName: string;
  subject: string; html: string; text: string;
  reviewRequestId: string;
}): Promise<{ emailId: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ... }),
  });
  if (!res.ok) throw new ResendError(await res.text());
  const data = await res.json();
  return { emailId: data.id };
}
```

## 4. Email tracking strategy

**Primary tracking lives in our app** — every event is tied to the review token:

| Event | Mechanism | Column |
| --- | --- | --- |
| Open | Our 1×1 pixel `GET /api/track/open?t={token}` | `email_opened_at` |
| Star click | Our `GET /r/{token}?rating=N` | `rating_submitted_at` |
| Google link click | Our `GET /g/{token}` → 302 | `google_review_clicked_at` / count |
| Delivered / bounced | Resend webhooks (free) | `email_delivered_at` / `email_bounced_at` |

We use our own pixel/links instead of Resend's link tracking so every event stays tied to the
review token and redirect wrappers don't interfere with our counters. Resend
webhooks handle delivered/bounced.

## 5. Resend webhooks (free, built-in)

- Create at **https://resend.com/webhooks** → **Add Webhook**.
- Point at: `POST https://reviews.example.com/api/webhooks/resend`.
- Relevant event types: `email.sent`, `email.delivered`, `email.bounced`, `email.complained`,
  `email.opened`, `email.clicked`.
- **Signing:** Resend signs webhooks with Svix headers (`svix-id`, `svix-timestamp`,
  `svix-signature`). Verify with the `svix` package using `RESEND_WEBHOOK_SECRET`.
- **Payload:** `{ "type": "email.delivered", "data": { "email_id": "...", "to": ["..."], ... } }`
  — correlate via `data.email_id` (matches `sender_email_id`), fallback to `data.to[0]`.
- **At-least-once delivery:** our column updates are guarded (`WHERE ... IS NULL`) so duplicate
  deliveries don't overwrite. Optionally dedup on the `svix-id` header.
- Webhook retry schedule (non-2xx): 5s, 5m, 30m, 2h, 5h, 10h. Always ack `200` after processing.

## 6. Verification checklist for Phase 5

- [ ] Resend API key works; a test send succeeds.
- [ ] `/emails` returns `{ id }`; we persist it.
- [ ] The HTML renders and stars are clickable across Gmail/Apple Mail/Outlook.
- [ ] Our open-pixel fires and sets `email_opened_at` once.
- [ ] Webhook endpoint registered, signature verified, idempotent.
- [ ] Rate-limit/backoff on Resend API errors handled.

## 7. Env vars

| Var | Example |
| --- | --- |
| `RESEND_API_KEY` | `re_...` |
| `RESEND_FROM_EMAIL` | `reviews@example.com` |
| `RESEND_FROM_NAME` | `Example Cafe` |
| `RESEND_WEBHOOK_SECRET` | `whsec_...` (Svix signing secret) |
