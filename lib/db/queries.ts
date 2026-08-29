import { createHash } from "node:crypto";
import { and, eq, sql, desc, asc, isNull } from "drizzle-orm";
import { db } from ".";
import {
  businesses,
  apiKeys,
  customers,
  orders,
  reviewRequests,
} from "./schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ReviewRequestRow = typeof reviewRequests.$inferSelect;
export type CreateReviewRequestResult =
  | { status: "created"; id: string }
  | { status: "duplicate"; id: string };

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// ---------------------------------------------------------------------------
// createReviewRequest
//   Business logic: upsert customer → upsert order → insert review request
//   Idempotency: unique (business_id, order_id) — duplicate returns existing row.
//   Returns the review request id and whether it was newly created.
// ---------------------------------------------------------------------------
export async function createReviewRequest(opts: {
  businessId: string;
  tokenHash: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  orderId: string;
  orderDate?: Date | null;
  orderMetadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}): Promise<CreateReviewRequestResult> {
  return await db.transaction(async (tx) => {
    // 1. Upsert customer (by business + email, unique)
    //    Use ON CONFLICT DO NOTHING so concurrent calls don't race on the
    //    unique (business_id, email) index.
    const insertedCustomer = await tx
      .insert(customers)
      .values({
        businessId: opts.businessId,
        name: opts.customerName,
        email: opts.customerEmail,
        phone: opts.customerPhone ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: customers.id });

    let customerId: string;
    if (insertedCustomer.length > 0) {
      customerId = insertedCustomer[0].id;
    } else {
      const existing = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.businessId, opts.businessId),
            eq(customers.email, opts.customerEmail),
          ),
        )
        .limit(1)
        .then((r) => r[0]);
      customerId = existing!.id;
    }

    // 2. Upsert order (by business + external_order_id, unique)
    const insertedOrder = await tx
      .insert(orders)
      .values({
        businessId: opts.businessId,
        customerId,
        externalOrderId: opts.orderId,
        orderDate: opts.orderDate ?? null,
        metadata: (opts.orderMetadata as Record<string, unknown>) ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: orders.id });

    let orderIdVal: string;
    if (insertedOrder.length > 0) {
      orderIdVal = insertedOrder[0].id;
    } else {
      const existing = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.businessId, opts.businessId),
            eq(orders.externalOrderId, opts.orderId),
          ),
        )
        .limit(1)
        .then((r) => r[0]);
      orderIdVal = existing!.id;
    }

    // 3. Try to insert review request (idempotency on business+order)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const inserted = await tx
      .insert(reviewRequests)
      .values({
        businessId: opts.businessId,
        customerId,
        orderId: orderIdVal,
        tokenHash: opts.tokenHash,
        idempotencyKey: opts.idempotencyKey ?? null,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: reviewRequests.id });

    if (inserted.length === 0) {
      // Duplicate (business+order already has a review request) — fetch existing
      const existing = await tx
        .select({ id: reviewRequests.id })
        .from(reviewRequests)
        .where(
          and(
            eq(reviewRequests.businessId, opts.businessId),
            eq(reviewRequests.orderId, orderIdVal),
          ),
        )
        .limit(1)
        .then((r) => r[0]);
      return { status: "duplicate" as const, id: existing!.id };
    }

    return { status: "created" as const, id: inserted[0].id };
  });
}

// ---------------------------------------------------------------------------
// findRequestByTokenHash
//   Joins customer → order → business. Used by the review route handler.
//   Returns null if the token hash doesn't match any review request.
// ---------------------------------------------------------------------------
export async function findRequestByTokenHash(tokenHash: string) {
  const rows = await db
    .select({
      request: reviewRequests,
      customer: {
        id: customers.id,
        name: customers.name,
        email: customers.email,
      },
      order: {
        id: orders.id,
        externalOrderId: orders.externalOrderId,
        orderDate: orders.orderDate,
        metadata: orders.metadata,
      },
      business: {
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        googleReviewUrl: businesses.googleReviewUrl,
      },
    })
    .from(reviewRequests)
    .innerJoin(customers, eq(customers.id, reviewRequests.customerId))
    .innerJoin(orders, eq(orders.id, reviewRequests.orderId))
    .innerJoin(businesses, eq(businesses.id, reviewRequests.businessId))
    .where(eq(reviewRequests.tokenHash, tokenHash))
    .limit(1);

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// getReviewRequestForEmail
//   Data needed to send the review email for a given request id.
// ---------------------------------------------------------------------------
export async function getReviewRequestForEmail(id: string) {
  const rows = await db
    .select({
      id: reviewRequests.id,
      createdAt: reviewRequests.createdAt,
      emailSentAt: reviewRequests.emailSentAt,
      senderEmailId: reviewRequests.senderEmailId,
      customerEmail: customers.email,
      customerName: customers.name,
      businessName: businesses.name,
    })
    .from(reviewRequests)
    .innerJoin(customers, eq(customers.id, reviewRequests.customerId))
    .innerJoin(businesses, eq(businesses.id, reviewRequests.businessId))
    .where(eq(reviewRequests.id, id))
    .limit(1);

  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// updateRequestToken
//   Regenerate a request's token (only safe when the email was never sent,
//   i.e. the old token was never exposed).
// ---------------------------------------------------------------------------
export async function updateRequestToken(id: string, tokenHash: string) {
  await db
    .update(reviewRequests)
    .set({ tokenHash, updatedAt: new Date() })
    .where(eq(reviewRequests.id, id));
}

// ---------------------------------------------------------------------------
// markEmailSent
// ---------------------------------------------------------------------------
export async function markEmailSent(id: string, senderEmailId: string) {
  const updated = await db
    .update(reviewRequests)
    .set({
      emailSentAt: new Date(),
      senderEmailId,
      updatedAt: new Date(),
    })
    .where(and(eq(reviewRequests.id, id), isNull(reviewRequests.emailSentAt)))
    .returning({ id: reviewRequests.id });

  return updated[0] ?? null;
}

// ---------------------------------------------------------------------------
// recordRating  — conditional update (rate exactly once)
// ---------------------------------------------------------------------------
export async function recordRating(
  requestOrId: ReviewRequestRow | string,
  rating: 1 | 2 | 3 | 4 | 5,
) {
  const id =
    typeof requestOrId === "string" ? requestOrId : requestOrId.id;

  const updated = await db
    .update(reviewRequests)
    .set({ rating, ratingSubmittedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(reviewRequests.id, id),
        isNull(reviewRequests.rating),
        sql`${reviewRequests.expiresAt} > now()`,
      ),
    )
    .returning({ id: reviewRequests.id, rating: reviewRequests.rating });

  return updated[0] ?? null;
}

// ---------------------------------------------------------------------------
// recordFeedback — conditional update (submit only once)
// ---------------------------------------------------------------------------
export async function recordFeedback(
  requestOrId: ReviewRequestRow | string,
  feedback: string,
) {
  const id =
    typeof requestOrId === "string" ? requestOrId : requestOrId.id;

  const updated = await db
    .update(reviewRequests)
    .set({ feedback, feedbackSubmittedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(reviewRequests.id, id),
        isNull(reviewRequests.feedbackSubmittedAt),
      ),
    )
    .returning({ id: reviewRequests.id });

  return updated[0] ?? null;
}

// ---------------------------------------------------------------------------
// recordOpen — set email_opened_at on first open only
// ---------------------------------------------------------------------------
export async function recordOpen(requestOrId: ReviewRequestRow | string) {
  const id =
    typeof requestOrId === "string" ? requestOrId : requestOrId.id;

  const updated = await db
    .update(reviewRequests)
    .set({ emailOpenedAt: new Date() })
    .where(
      and(
        eq(reviewRequests.id, id),
        isNull(reviewRequests.emailOpenedAt),
      ),
    )
    .returning({ id: reviewRequests.id });

  return updated[0] ?? null;
}

// ---------------------------------------------------------------------------
// recordGoogleClick — increment count, set timestamp on first click
// ---------------------------------------------------------------------------
export async function recordGoogleClick(
  requestOrId: ReviewRequestRow | string,
) {
  const id =
    typeof requestOrId === "string" ? requestOrId : requestOrId.id;

  const updated = await db
    .update(reviewRequests)
    .set({
      googleReviewClickCount: sql`${reviewRequests.googleReviewClickCount} + 1`,
      googleReviewClickedAt: sql`COALESCE(${reviewRequests.googleReviewClickedAt}, now())`,
      updatedAt: new Date(),
    })
    .where(eq(reviewRequests.id, id))
    .returning({
      id: reviewRequests.id,
      googleReviewClickCount: reviewRequests.googleReviewClickCount,
    });

  return updated[0] ?? null;
}

// ---------------------------------------------------------------------------
// recordSenderEvent — set delivery/bounce status from email-provider webhooks
//   Idempotent: only fills the field if it is still NULL.
// ---------------------------------------------------------------------------
export async function recordSenderEvent(
  senderEmailId: string,
  event: "delivered" | "bounced",
) {
  const field = event === "delivered" ? "emailDeliveredAt" : "emailBouncedAt";

  const updated = await db
    .update(reviewRequests)
    .set({ [field]: new Date() })
    .where(
      and(
        eq(reviewRequests.senderEmailId, senderEmailId),
        isNull(field === "emailDeliveredAt" ? reviewRequests.emailDeliveredAt : reviewRequests.emailBouncedAt),
      ),
    )
    .returning({ id: reviewRequests.id });

  return updated[0] ?? null;
}

// ---------------------------------------------------------------------------
// recordSenderEventByEmail
//   Fallback correlation when the webhook has no emailId: match the most
//   recently sent review request for a customer email that hasn't yet been
//   marked with this event.
// ---------------------------------------------------------------------------
export async function recordSenderEventByEmail(
  email: string,
  event: "delivered" | "bounced",
) {
  const field = event === "delivered" ? "emailDeliveredAt" : "emailBouncedAt";
  const guard =
    event === "delivered" ? reviewRequests.emailDeliveredAt : reviewRequests.emailBouncedAt;

  const rows = await db
    .select({ id: reviewRequests.id })
    .from(reviewRequests)
    .innerJoin(customers, eq(customers.id, reviewRequests.customerId))
    .where(and(eq(customers.email, email), isNull(guard)))
    .orderBy(desc(reviewRequests.emailSentAt))
    .limit(1);

  const target = rows[0];
  if (!target) return null;

  const updated = await db
    .update(reviewRequests)
    .set({ [field]: new Date() })
    .where(and(eq(reviewRequests.id, target.id), isNull(guard)))
    .returning({ id: reviewRequests.id });

  return updated[0] ?? null;
}

// ---------------------------------------------------------------------------
// authenticateApiKey — look up active API key by hash
// ---------------------------------------------------------------------------
export async function authenticateApiKey(keyHash: string) {
  const row = await db
    .select({
      keyId: apiKeys.id,
      businessId: apiKeys.businessId,
      status: apiKeys.status,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!row) return null;
  if (row.status !== "active") return null;

  // Update last_used_at (fire-and-forget, don't fail the request)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.keyId))
    .execute()
    .catch(() => {});

  return { keyId: row.keyId, businessId: row.businessId };
}

// ---------------------------------------------------------------------------
// getReviewRequestStatus
//   Business-facing status check (GET /api/review-requests/:id)
// ---------------------------------------------------------------------------
export async function getReviewRequestStatus(businessId: string, id: string) {
  const row = await db
    .select({
      id: reviewRequests.id,
      rating: reviewRequests.rating,
      ratingSubmittedAt: reviewRequests.ratingSubmittedAt,
      feedbackSubmittedAt: reviewRequests.feedbackSubmittedAt,
      googleReviewClickedAt: reviewRequests.googleReviewClickedAt,
      createdAt: reviewRequests.createdAt,
    })
    .from(reviewRequests)
    .where(
      and(eq(reviewRequests.businessId, businessId), eq(reviewRequests.id, id)),
    )
    .limit(1)
    .then((r) => r[0] ?? null);

  if (!row) return null;

  const status =
    !row.ratingSubmittedAt
      ? "pending"
      : !row.feedbackSubmittedAt
        ? "rated"
        : "completed";

  return {
    id: row.id,
    status,
    rating: row.rating,
    feedbackSubmitted: row.feedbackSubmittedAt !== null,
    googleReviewClicked: row.googleReviewClickedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Dashboard queries
// ---------------------------------------------------------------------------

/** Aggregated metrics for the overview page */
export async function metrics(businessId: string) {
  const row = await db
    .select({
      total: sql<number>`count(*)::int`,
      rated: sql<number>`count(${reviewRequests.rating})::int`,
      avgRating: sql<number>`round(avg(${reviewRequests.rating}), 2)`,
      pending: sql<number>`sum(case when ${reviewRequests.ratingSubmittedAt} is null then 1 else 0 end)::int`,
      feedbackSubmitted: sql<number>`sum(case when ${reviewRequests.feedbackSubmittedAt} is not null then 1 else 0 end)::int`,
      googleClicked: sql<number>`sum(case when ${reviewRequests.googleReviewClickedAt} is not null then 1 else 0 end)::int`,
    })
    .from(reviewRequests)
    .where(eq(reviewRequests.businessId, businessId))
    .then((r) => r[0]);

  const distribution = await db
    .select({
      rating: reviewRequests.rating,
      count: sql<number>`count(*)::int`,
    })
    .from(reviewRequests)
    .where(
      and(
        eq(reviewRequests.businessId, businessId),
        sql`${reviewRequests.rating} IS NOT NULL`,
      ),
    )
    .groupBy(reviewRequests.rating)
    .orderBy(asc(reviewRequests.rating));

  const responseRate =
    row.total > 0 ? Math.round((row.rated / row.total) * 100) : 0;

  return { ...row, responseRate, distribution };
}

export type ListFilters = {
  rating?: number;
  status?: "pending" | "rated" | "completed";
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sort?: "newest" | "oldest";
  page?: number;
  perPage?: number;
};

/** Paginated list of review requests */
export async function listRequests(businessId: string, filters: ListFilters = {}) {
  const {
    rating,
    status,
    search,
    dateFrom,
    dateTo,
    sort = "newest",
    page = 1,
    perPage = 25,
  } = filters;

  const conditions = [eq(reviewRequests.businessId, businessId)];

  if (rating !== undefined) {
    conditions.push(eq(reviewRequests.rating, rating));
  }
  if (status === "pending") {
    conditions.push(isNull(reviewRequests.ratingSubmittedAt));
  } else if (status === "rated") {
    conditions.push(sql`${reviewRequests.ratingSubmittedAt} IS NOT NULL AND ${reviewRequests.feedbackSubmittedAt} IS NULL`);
  } else if (status === "completed") {
    conditions.push(sql`${reviewRequests.feedbackSubmittedAt} IS NOT NULL`);
  }
  if (dateFrom) {
    conditions.push(sql`${reviewRequests.createdAt} >= ${dateFrom.toISOString()}`);
  }
  if (dateTo) {
    conditions.push(sql`${reviewRequests.createdAt} <= ${dateTo.toISOString()}`);
  }
  if (search) {
    conditions.push(
      sql`(${customers.name} ILIKE ${"%" + search + "%"} OR ${customers.email} ILIKE ${"%" + search + "%"} OR ${orders.externalOrderId} ILIKE ${"%" + search + "%"})`,
    );
  }

  const whereClause = and(...conditions);

  const rows = await db
    .select({
      id: reviewRequests.id,
      rating: reviewRequests.rating,
      feedback: reviewRequests.feedback,
      ratingSubmittedAt: reviewRequests.ratingSubmittedAt,
      feedbackSubmittedAt: reviewRequests.feedbackSubmittedAt,
      googleReviewClickedAt: reviewRequests.googleReviewClickedAt,
      googleReviewClickCount: reviewRequests.googleReviewClickCount,
      emailSentAt: reviewRequests.emailSentAt,
      emailOpenedAt: reviewRequests.emailOpenedAt,
      createdAt: reviewRequests.createdAt,
      customerName: customers.name,
      customerEmail: customers.email,
      externalOrderId: orders.externalOrderId,
    })
    .from(reviewRequests)
    .innerJoin(customers, eq(customers.id, reviewRequests.customerId))
    .innerJoin(orders, eq(orders.id, reviewRequests.orderId))
    .where(whereClause)
    .orderBy(sort === "newest" ? desc(reviewRequests.createdAt) : asc(reviewRequests.createdAt))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const countResult = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviewRequests)
    .innerJoin(customers, eq(customers.id, reviewRequests.customerId))
    .innerJoin(orders, eq(orders.id, reviewRequests.orderId))
    .where(whereClause)
    .then((r) => r[0].total);

  return { rows, total: countResult, page, perPage };
}

/** Single review request detail with customer/order/business */
export async function getRequest(id: string) {
  return db
    .select({
      request: reviewRequests,
      customer: {
        name: customers.name,
        email: customers.email,
      },
      order: {
        externalOrderId: orders.externalOrderId,
        orderDate: orders.orderDate,
        metadata: orders.metadata,
      },
      business: {
        name: businesses.name,
        googleReviewUrl: businesses.googleReviewUrl,
      },
    })
    .from(reviewRequests)
    .innerJoin(customers, eq(customers.id, reviewRequests.customerId))
    .innerJoin(orders, eq(orders.id, reviewRequests.orderId))
    .innerJoin(businesses, eq(businesses.id, reviewRequests.businessId))
    .where(eq(reviewRequests.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);
}

// ---------------------------------------------------------------------------
// findOrCreateBusiness
// ---------------------------------------------------------------------------
export async function findOrCreateBusiness(opts: {
  name: string;
  slug: string;
  googleReviewUrl?: string | null;
}) {
  const existing = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, opts.slug))
    .limit(1)
    .then((r) => r[0] ?? null);

  if (existing) return existing;

  return db
    .insert(businesses)
    .values({
      name: opts.name,
      slug: opts.slug,
      googleReviewUrl: opts.googleReviewUrl ?? null,
    })
    .returning()
    .then((r) => r[0]);
}

// ---------------------------------------------------------------------------
// getBusiness — fetch a business by id
// ---------------------------------------------------------------------------
export async function getBusiness(businessId: string) {
  return db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
    .then((r) => r[0] ?? null);
}

// ---------------------------------------------------------------------------
// updateBusiness — update business settings
// ---------------------------------------------------------------------------
export async function updateBusiness(
  businessId: string,
  data: { name?: string; googleReviewUrl?: string | null },
) {
  const sets: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) sets.name = data.name;
  if (data.googleReviewUrl !== undefined) sets.googleReviewUrl = data.googleReviewUrl;

  return db
    .update(businesses)
    .set(sets)
    .where(eq(businesses.id, businessId))
    .returning()
    .then((r) => r[0] ?? null);
}
