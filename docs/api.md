# API — Business Integration

Spec for how the existing business application talks to our system.

The business app needs exactly one endpoint for the MVP. All requests go over HTTPS to our
domain (`https://reviews.example.com`).

## 1. Authentication

- **Header:** `Authorization: Bearer <api_key>`
- Key format: `rqk_` followed by 43 random base64url characters (256 bits).
- The business is identified **by the key** — never by a field in the payload.
- A key can be revoked from the dashboard; revoked keys return `401`.
- Rate limiting is applied per key (see [security.md](./security.md) §5).

## 2. Endpoint: `POST /api/review-requests`

Creates a review request and sends the review email.

### Request

```
POST /api/review-requests
Authorization: Bearer rqk_...Zz3f9...
Content-Type: application/json
```

```json
{
  "customerName": "Angela",
  "customerEmail": "angela@example.com",
  "orderId": "12345",
  "orderDate": "2026-08-20T10:00:00Z",
  "customerPhone": "+15551234567",
  "orderMetadata": { "items": 3, "currency": "USD" }
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `customerName` | string | yes | 1–200 chars |
| `customerEmail` | string | yes | valid email, ≤254 chars |
| `orderId` | string | yes | 1–255 chars |
| `orderDate` | ISO 8601 | no | valid date |
| `customerPhone` | string | no | ≤32 chars |
| `orderMetadata` | object | no | flat JSON, ≤8 KB |

`orderMetadata` is stored but never displayed by default and never placed in URLs.

### Idempotency

- `(business_id, order_id)` is unique: calling the same `orderId` twice returns the existing
  review request instead of creating a duplicate.
- Optional: send header `Idempotency-Key: <string>` to be extra safe across different order IDs.
  (Only useful if you intend multiple requests per order in the future.)
- On retry-after-timeout, the second call returns `200` with the same `id`.

### Success response — `201 Created`

```json
{
  "id": "018f...-uuid",
  "status": "created",
  "createdAt": "2026-08-29T09:00:00.000Z"
}
```

- A retry that hit an existing request returns `200 OK` with the same shape
  (plus `"duplicate": true`).

### Error responses

| Status | Meaning | Body |
| --- | --- | --- |
| `400` | Malformed JSON / invalid payload | `{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }` |
| `401` | Missing, malformed, invalid, or revoked API key | `{ "error": { "code": "UNAUTHORIZED", "message": "Invalid API key" } }` |
| `429` | Too many requests | `{ "error": { "code": "RATE_LIMITED", "message": "Too many requests", "retryAfter": 60 } }` |
| `500` | Unexpected server error | `{ "error": { "code": "INTERNAL", "message": "Internal server error" } }` |

Notes:
- `details` for `VALIDATION_ERROR` lists field-level problems, e.g.
  `{ "field": "customerEmail", "issue": "Invalid email" }`.
- The review token is **never** returned to the business app (only the email contains it).
- The endpoint returns after the Sender send is attempted; a Sender failure returns `500`
  with code `EMAIL_SEND_FAILED` but the review request row **is** created (idempotency means a
  retry will attach to the existing row).

### Example request (curl)

```bash
curl -X POST https://reviews.example.com/api/review-requests \
  -H "Authorization: Bearer rqk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Angela","customerEmail":"angela@example.com","orderId":"12345"}'
```

### Example response

```json
{
  "id": "3f2c...-uuid",
  "status": "created",
  "createdAt": "2026-08-29T09:00:00.000Z"
}
```

## 3. Endpoint (optional): `GET /api/review-requests/{id}`

For the business to check the status of a request (nice-to-have; not needed for MVP flows).

- Same `Authorization: Bearer` auth.
- Returns the same JSON shape as `POST` plus current status
  (`pending` / `rated` / `completed`), `rating`, and whether feedback/Google click happened.
- `404` if the id does not exist for this business.

## 4. Rate limits

- Default: **60 requests/minute per API key** (token bucket). Tune in config.
- Response on exceeding: `429` with `Retry-After` header.
- Implementation: Upstash Ratelimit (recommended, works across serverless instances) or an
  in-memory store for local dev only.

## 5. API key lifecycle (dashboard)

1. **Generate** — dashboard "API Keys" page creates `rqk_live_...`. The raw key is shown
   **once** and never stored; only its hash is saved. Regenerate anytime.
2. **Name/label** — e.g. "Production", "Staging" (per key).
3. **Revoke** — flips `status='revoked'`, immediately stops authentication.
4. **Last used** — shown in the dashboard for visibility.

There is no API to create keys programmatically in the MVP; it is dashboard-only.

## 6. Example integration snippets

### Node/TypeScript (their backend)

```ts
const res = await fetch("https://reviews.example.com/api/review-requests", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.REVIEW_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    customerName: order.customer.name,
    customerEmail: order.customer.email,
    orderId: order.id,
  }),
});
if (!res.ok) {
  // 401/429/5xx — log; do NOT resend for 429 without honoring retryAfter
  return;
}
const { id } = await res.json();
```

### PHP (example)

```php
$res = wp_remote_post("https://reviews.example.com/api/review-requests", [
  "headers" => [
    "Authorization" => "Bearer " . getenv("REVIEW_API_KEY"),
    "Content-Type"  => "application/json",
  ],
  "body" => json_encode([
    "customerName" => $customer["name"],
    "customerEmail" => $customer["email"],
    "orderId" => $order["id"],
  ]),
]);
```

## 7. Integration checklist for the business team

- [ ] Store the API key in a secure backend secret store (never in frontend code).
- [ ] Call `POST /api/review-requests` when a review should be requested (e.g. order delivered).
- [ ] Handle `429` with exponential backoff honoring `retryAfter`.
- [ ] Treat `200`/`201` as success; `id` may be stored for status checks.
- [ ] Do not log the API key; do not include it in URLs.
- [ ] Never call with an email that was not explicitly consented for transactional mail.
