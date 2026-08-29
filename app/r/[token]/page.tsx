import { notFound } from "next/navigation";
import { hashToken } from "@/lib/token";
import { findRequestByTokenHash, recordRating } from "@/lib/db/queries";
import { StarInput } from "@/components/review/StarInput";
import { FeedbackForm } from "@/components/review/FeedbackForm";

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
        token={token}
        customerName={req.customer.name}
        businessName={req.business.name}
        rating={effectiveRating}
        feedbackSubmitted={req.request.feedbackSubmittedAt !== null}
        hasGoogleReviewUrl={!!req.business.googleReviewUrl}
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
// ---------------------------------------------------------------------------
function ResultPage({
  token,
  customerName,
  businessName,
  rating,
  feedbackSubmitted,
  hasGoogleReviewUrl,
}: {
  token: string;
  customerName: string;
  businessName: string;
  rating: Rating;
  feedbackSubmitted: boolean;
  hasGoogleReviewUrl: boolean;
}) {
  const showGoogleCta = rating >= 4 && hasGoogleReviewUrl;

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
      {feedbackSubmitted ? (
        <p style={{ color: "#71717a", fontSize: "0.875rem" }}>
          Thanks for your feedback!
        </p>
      ) : (
        <FeedbackForm token={token} rating={rating} />
      )}
      {showGoogleCta && (
        <a
          href={`/g/${token}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "1.25rem",
            padding: "0.75rem 1.5rem",
            background: "#fff",
            color: "#111827",
            border: "1px solid #d4d4d8",
            borderRadius: "8px",
            fontSize: "0.875rem",
            fontWeight: 600,
            textDecoration: "none",
            transition: "background 0.15s",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Leave us a Google review
        </a>
      )}
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
