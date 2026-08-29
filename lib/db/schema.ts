import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// businesses
// ---------------------------------------------------------------------------
export const businesses = pgTable(
  "businesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").unique().notNull(),
    googleReviewUrl: text("google_review_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
);

// ---------------------------------------------------------------------------
// api_keys
// ---------------------------------------------------------------------------
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .references(() => businesses.id)
      .notNull(),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").unique().notNull(),
    status: text("status", { enum: ["active", "revoked"] })
      .default("active")
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_api_keys_business").on(t.businessId),
  ],
);

// ---------------------------------------------------------------------------
// customers
// ---------------------------------------------------------------------------
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .references(() => businesses.id)
      .notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("idx_customers_business_email").on(t.businessId, t.email),
  ],
);

// ---------------------------------------------------------------------------
// orders
// ---------------------------------------------------------------------------
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .references(() => businesses.id)
      .notNull(),
    customerId: uuid("customer_id")
      .references(() => customers.id)
      .notNull(),
    externalOrderId: text("external_order_id").notNull(),
    orderDate: timestamp("order_date", { withTimezone: true }),
    metadata: jsonb("metadata").default("{}").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("idx_orders_business_external").on(
      t.businessId,
      t.externalOrderId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// review_requests
// ---------------------------------------------------------------------------
export const reviewRequests = pgTable(
  "review_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .references(() => businesses.id)
      .notNull(),
    customerId: uuid("customer_id")
      .references(() => customers.id)
      .notNull(),
    orderId: uuid("order_id")
      .references(() => orders.id)
      .notNull(),
    tokenHash: text("token_hash").unique().notNull(),
    idempotencyKey: text("idempotency_key"),

    rating: smallint("rating"),
    feedback: text("feedback"),

    ratingSubmittedAt: timestamp("rating_submitted_at", { withTimezone: true }),
    feedbackSubmittedAt: timestamp("feedback_submitted_at", {
      withTimezone: true,
    }),
    googleReviewClickedAt: timestamp("google_review_clicked_at", {
      withTimezone: true,
    }),
    googleReviewClickCount: integer("google_review_click_count")
      .default(0)
      .notNull(),

    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    emailDeliveredAt: timestamp("email_delivered_at", { withTimezone: true }),
    emailBouncedAt: timestamp("email_bounced_at", { withTimezone: true }),
    emailOpenedAt: timestamp("email_opened_at", { withTimezone: true }),
    senderEmailId: text("sender_email_id"),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // Idempotency: one request per business+order
    uniqueIndex("idx_review_requests_business_order").on(
      t.businessId,
      t.orderId,
    ),
    // Dashboard: newest first
    index("idx_review_requests_business_created").on(
      t.businessId,
      t.createdAt,
    ),
    // Dashboard filter by rating
    index("idx_review_requests_business_rating").on(
      t.businessId,
      t.rating,
    ),
    // Dashboard filter by status (pending = rating_submitted_at IS NULL)
    index("idx_review_requests_business_status").on(
      t.businessId,
      t.ratingSubmittedAt,
    ),
    // Rating must be 1–5 when set
    check("chk_rating_range", sql`${t.rating} >= 1 AND ${t.rating} <= 5`),
    // Partial unique index: idempotency_key is unique per business when not null
    uniqueIndex("idx_review_requests_idempotency").on(
      t.businessId,
      t.idempotencyKey,
    ).where(sql`${t.idempotencyKey} IS NOT NULL`),
  ],
);
