CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"google_review_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"external_order_id" text NOT NULL,
	"order_date" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"idempotency_key" text,
	"rating" smallint,
	"feedback" text,
	"rating_submitted_at" timestamp with time zone,
	"feedback_submitted_at" timestamp with time zone,
	"google_review_clicked_at" timestamp with time zone,
	"google_review_click_count" integer DEFAULT 0 NOT NULL,
	"email_sent_at" timestamp with time zone,
	"email_delivered_at" timestamp with time zone,
	"email_bounced_at" timestamp with time zone,
	"email_opened_at" timestamp with time zone,
	"sender_email_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_requests_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "chk_rating_range" CHECK ("review_requests"."rating" >= 1 AND "review_requests"."rating" <= 5)
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_business" ON "api_keys" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "idx_customers_business_email" ON "customers" USING btree ("business_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_orders_business_external" ON "orders" USING btree ("business_id","external_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_review_requests_business_order" ON "review_requests" USING btree ("business_id","order_id");--> statement-breakpoint
CREATE INDEX "idx_review_requests_business_created" ON "review_requests" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_review_requests_business_rating" ON "review_requests" USING btree ("business_id","rating");--> statement-breakpoint
CREATE INDEX "idx_review_requests_business_status" ON "review_requests" USING btree ("business_id","rating_submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_review_requests_idempotency" ON "review_requests" USING btree ("business_id","idempotency_key") WHERE "review_requests"."idempotency_key" IS NOT NULL;