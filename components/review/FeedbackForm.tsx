"use client";

import { useState } from "react";

interface FeedbackFormProps {
  token: string;
  rating: number;
}

export function FeedbackForm({ token, rating }: FeedbackFormProps) {
  const [feedback, setFeedback] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "submitted" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const isLowRating = rating <= 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (feedback.trim().length < 2) return;

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/reviews/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, feedback: feedback.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatus("submitted");
      } else {
        setErrorMsg(data.error?.message || "Something went wrong");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Network error — please try again");
      setStatus("error");
    }
  }

  if (status === "submitted") {
    return (
      <div style={{ textAlign: "center", padding: "1rem 0" }}>
        <p style={{ color: "#16a34a", fontWeight: 600, marginBottom: "0.25rem" }}>
          Thanks for your feedback!
        </p>
        <p style={{ color: "#71717a", fontSize: "0.875rem" }}>
          It helps us improve.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: "1.5rem", textAlign: "left" }}>
      <label
        htmlFor="feedback"
        style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#374151", marginBottom: "0.5rem" }}
      >
        {isLowRating
          ? "We're sorry about that. What went wrong?"
          : "Tell us more about your experience!"}
      </label>
      <textarea
        id="feedback"
        rows={4}
        maxLength={2000}
        placeholder={isLowRating ? "What could we do better?" : "Share your thoughts..."}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        required
        minLength={2}
        style={{
          width: "100%",
          padding: "0.75rem",
          border: "1px solid #d4d4d8",
          borderRadius: "8px",
          fontSize: "0.875rem",
          resize: "vertical",
          fontFamily: "system-ui, sans-serif",
          boxSizing: "border-box",
        }}
      />
      {status === "error" && (
        <p style={{ color: "#dc2626", fontSize: "0.8rem", marginTop: "0.25rem" }}>
          {errorMsg}
        </p>
      )}
      <button
        type="submit"
        disabled={feedback.trim().length < 2 || status === "submitting"}
        style={{
          marginTop: "0.75rem",
          padding: "0.625rem 1.25rem",
          background: isLowRating ? "#dc2626" : "#2563eb",
          color: "#fff",
          border: "none",
          borderRadius: "8px",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: feedback.trim().length < 2 || status === "submitting" ? "not-allowed" : "pointer",
          opacity: feedback.trim().length < 2 || status === "submitting" ? 0.6 : 1,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {status === "submitting" ? "Sending..." : "Submit feedback"}
      </button>
    </form>
  );
}
