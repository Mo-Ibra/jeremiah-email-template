"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/dashboard/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Login failed");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        background: "#f5f5f5",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "#fff",
          padding: "2rem",
          borderRadius: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          width: "100%",
          maxWidth: "360px",
        }}
      >
        <h1 style={{ margin: "0 0 1.5rem", fontSize: "1.25rem" }}>
          Dashboard Login
        </h1>

        {error && (
          <div
            style={{
              background: "#fef2f2",
              color: "#991b1b",
              padding: "0.75rem",
              borderRadius: "4px",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        <label style={{ display: "block", marginBottom: "1rem" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.5rem",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              fontSize: "0.875rem",
            }}
          />
        </label>

        <label style={{ display: "block", marginBottom: "1.5rem" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              display: "block",
              width: "100%",
              marginTop: "0.25rem",
              padding: "0.5rem",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              fontSize: "0.875rem",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "0.625rem",
            background: "#111827",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            fontSize: "0.875rem",
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
