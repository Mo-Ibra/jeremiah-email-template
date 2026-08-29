import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared validation schemas (docs/api.md)
// ---------------------------------------------------------------------------

export const createReviewRequestSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.email().max(254),
  orderId: z.string().trim().min(1).max(255),
  orderDate: z.string().datetime().optional().nullable(),
  customerPhone: z.string().trim().min(1).max(32).optional().nullable(),
  orderMetadata: z
    .record(z.string(), z.unknown())
    .optional()
    .nullable(),
});

export type CreateReviewRequestInput = z.infer<
  typeof createReviewRequestSchema
>;

export const feedbackSchema = z.object({
  token: z.string().trim().min(1).max(200),
  feedback: z.string().trim().min(2).max(2000),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

// Order metadata must serialize to ≤ 8 KB
export function isMetadataWithinLimit(metadata: unknown): boolean {
  if (metadata === undefined || metadata === null) return true;
  try {
    return Buffer.byteLength(JSON.stringify(metadata), "utf-8") <= 8 * 1024;
  } catch {
    return false;
  }
}
