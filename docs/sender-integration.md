# Sender Integration

Details for sending review emails through [Sender](https://sender.net) and tracking events.

## 1. Prerequisites

- A Sender.net account.
- An API access token: **Settings → API access tokens** (create one; store it as
  `SENDER_API_KEY` in env). Tokens use Bearer auth and carry full account access — keep them
  server-side only.
- A verified sender address (store as `SENDER_FROM_EMAIL` / `SENDER_FROM_NAME`).
- Account webhooks are a **paid** feature — see §6 (optional).

## 2. Base URL and auth

- Base URL: `https://api.sender.net/v2/`
- Header: `Authorization: Bearer <token>`
- `Content-Type: application/json`
- HTTPS only.

## 3. Sending the review email (transactional, no template)

Endpoint: `POST https://api.sender.net/v2/message/send`

Payload built by `lib/sender/sendReviewEmail.ts`:

```json
{
  "from": {
    "email": "reviews@example.com",
    "name": "Example Cafe"
  },
  "to": {
    "email": "angela@example.com",
    "name": "Angela"
  },
  "subject": "How was your order, Angela?",
  "text": "... plain text fallback ...",
  "html": "<html>... star links ...</html>",
  "headers": {
    "X-Review-Request-Id": "018f....-uuid"
  },
  "variables": {
    "review_request_id": "018f....-uuid"
  }
}
```

Success response (from Sender):

```json
{ "success": true, "message": "Email sent", "emailId": "ep2W4y-7pn8o21-YPpLY9PR5Jy9-x7GYQ" }
```

Persist `emailId` → `review_requests.sender_email_id`, and `email_sent_at = now()`.

Notes:
- The HTML is our fully-rendered template string (see [email-flow.md](./email-flow.md) §4).
- `text` (plain-text fallback) should always be provided.
- Custom `headers`/`variables` are included so a later Sender webhook can correlate back to the
  review request id (subject to Sender webhook payload support — verify during Phase 5).
- Attachments are not used in the MVP.

### Code shape

```ts
// lib/sender/client.ts
export async function sendReviewEmail(input: {
  fromEmail: string; fromName: string;
  toEmail: string; toName: string;
  subject: string; html: string; text: string;
  reviewRequestId: string;
}): Promise<{ emailId: string }> {
  const res = await fetch("https://api.sender.net/v2/message/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDER_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ ... }),
  });
  if (!res.ok) throw new SenderSendError(await res.text());
  const data = await res.json();
  if (!data.success) throw new SenderSendError(data.message);
  return { emailId: data.emailId };
}
```

## 4. Email tracking strategy

**Primary tracking lives in our app** — every event is tied to the review token:

| Event | Mechanism | Column |
| --- | --- | --- |
| Open | Our 1×1 pixel `GET /api/track/open?t={token}` | `email_opened_at` |
| Star click | Our `GET /r/{token}?rating=N` | `rating_submitted_at` |
| Google link click | Our `GET /g/{token}` → 302 | `google_review_clicked_at` / count |
| Delivered / bounced | Sender webhooks (paid, optional) | `email_delivered_at` / `email_bounced_at` |

Recommendation for MVP: **disable Sender's automatic link tracking** for these sends so Sender's
redirect wrappers do not interfere with our authoritative star-click and Google-click counters.
Keep open tracking via our pixel so open counts are per-review-request.

## 5. Sender webhooks (paid, optional but useful)

- Created in Sender under **Account → Webhooks** (or via API `POST /v2/account-webhooks/`).
- Point at: `POST https://reviews.example.com/api/webhooks/sender`.
- Useful event types: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`,
  `email.bounced`, `email.failed`, `email.spam`.
- Webhook handler (`app/api/webhooks/sender/route.ts`) must be **idempotent** (webhooks may be
  re-delivered): only set a column if it is NULL, or update to the latest timestamp.

### Correlation challenge

Sender webhook payloads (per the current public docs) identify the **subscriber/email**, not the
per-email `emailId`. Because one customer email may have several review requests over time, map
events conservatively:

1. If the payload includes an email id / our custom header — correlate directly.
2. Otherwise, correlate by `email` + nearest `email_sent_at` within a small window, and only
   fill NULL fields.

Verify the actual webhook payload during Phase 5 and adjust. If correlation proves unreliable,
drop webhooks for MVP — delivered/bounced are nice-to-have, not required.

## 6. Verification checklist for Phase 5

- [ ] Sender API token works; sandbox/test send succeeds.
- [ ] `/message/send` returns `emailId`; we persist it.
- [ ] The HTML renders and stars are clickable across Gmail/Apple Mail/Outlook.
- [ ] Our open-pixel fires and sets `email_opened_at` once.
- [ ] Optional: webhook endpoint created, verified, and idempotent.
- [ ] Rate-limit/backoff on Sender API errors handled (Sender may rate-limit high volume).

## 7. Env vars

| Var | Example |
| --- | --- |
| `SENDER_API_KEY` | `sl_...` (sender token) |
| `SENDER_FROM_EMAIL` | `reviews@example.com` |
| `SENDER_FROM_NAME` | `Example Cafe` |
