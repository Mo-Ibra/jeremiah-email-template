"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export function TestEmailForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<{
    status: "sending" | "sent" | "error";
    message: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    setResult({ status: "sending", message: "Sending..." });

    try {
      const res = await fetch("/api/dashboard/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          customerEmail: email.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({
          status: "sent",
          message: `Email sent to ${data.to}. Check your inbox!`,
        });
        setEmail("");
      } else {
        setResult({
          status: "error",
          message: data.error?.message || "Failed to send",
        });
      }
    } catch {
      setResult({ status: "error", message: "Network error" });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          placeholder="Customer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="flex-1"
        />
        <Input
          placeholder="Customer email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button
          type="submit"
          disabled={!name.trim() || !email.trim() || result?.status === "sending"}
        >
          {result?.status === "sending" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Send"
          )}
        </Button>
      </div>

      {result && result.status !== "sending" && (
        <Alert
          variant={result.status === "error" ? "destructive" : "default"}
          className={
            result.status === "sent"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
              : ""
          }
        >
          {result.status === "sent" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
