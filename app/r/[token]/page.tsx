import { notFound } from "next/navigation";
import { hashToken } from "@/lib/token";
import { findRequestByTokenHash, recordRating } from "@/lib/db/queries";
import { StarInput } from "@/components/review/StarInput";

export const dynamic = "force-dynamic";

const VALID_RATINGS = [1, 2, 3, 4, 5] as const;
type Rating = (typeof VALID_RATINGS)[number];

// ---------------------------------------------------------------------------
// GET /r/[token]?rating=N
// ---------------------------------------------------------------------------
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ rating?: string }>;
}) {
  const { token } = await params;
  const { rating: ratingParam } = await searchParams;

  // Look up by token hash — generic 404, no enumeration
  const req = await findRequestByTokenHash(hashToken(token));
  if (!req) {
    notFound();
  }

  // Expired
  if (req.request.expiresAt <= new Date()) {
    return <ExpiredPage />;
  }

  const ratingValue = ratingParam ? Number(ratingParam) : null;
  const isValidRating =
    ratingValue !== null &&
    VALID_RATINGS.includes(ratingValue as Rating);

  // Record the rating once (conditional UPDATE; repeats no-op)
  let effectiveRating: Rating | null = req.request.rating as Rating | null;
  if (isValidRating) {
    const updated = await recordRating(req.request, ratingValue as Rating);
    if (updated?.rating) {
      effectiveRating = updated.rating as Rating;
    }
  }

  // Result page — shown when a rating was just given or already exists
  if (effectiveRating !== null) {
    return (
      <ResultPage
        customerName={req.customer.name}
        businessName={req.business.name}
        rating={effectiveRating}
      />
    );
  }

  // Neutral landing page (no rating given yet)
  return (
    <NeutralPage
      customerName={req.customer.name}
      businessName={req.business.name}
      baseUrl={`/r/${token}`}
    />
  );
}

// ---------------------------------------------------------------------------
// Neutral landing page
// ---------------------------------------------------------------------------
function NeutralPage({
  customerName,
  businessName,
  baseUrl,
}: {
  customerName: string;
  businessName: string;
  baseUrl: string;
}) {
  return (
    <Shell>
      <h1>Hi {customerName},</h1>
      <p>
        How was your order with <strong>{businessName}</strong>? Tap a star to
        rate us:
      </p>
      <StarInput baseUrl={baseUrl} />
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Result page (rating recorded / already rated)
// Phase 7 will add the private feedback form here.
// ---------------------------------------------------------------------------
function ResultPage({
  customerName,
  businessName,
  rating,
}: {
  customerName: string;
  businessName: string;
  rating: Rating;
}) {
  return (
    <Shell>
      <h1>Thank you, {customerName}!</h1>
      <p>
        You rated <strong>{businessName}</strong> {rating} out of 5 stars.
      </p>
      <div
        style={{
          fontSize: "2rem",
          letterSpacing: "0.25rem",
          margin: "1rem 0",
          color: "#111827",
        }}
        aria-label={`${rating} out of 5 stars`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} style={{ color: n <= rating ? "#f59e0b" : "#d4d4d8" }}>
            ★
          </span>
        ))}
      </div>
      <p style={{ color: "#71717a", fontSize: "0.875rem" }}>
        We appreciate your feedback!
      </p>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Expired
// ---------------------------------------------------------------------------
function ExpiredPage() {
  return (
    <Shell>
      <h1>This link has expired</h1>
      <p>The review request is no longer available.</p>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Shared shell
// ---------------------------------------------------------------------------
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#f4f4f5",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "#fff",
          padding: "2.5rem",
          borderRadius: "12px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          width: "100%",
          maxWidth: "520px",
          textAlign: "center",
        }}
      >
        {children}
      </div>
    </main>
  );
}
