"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2, Send } from "lucide-react";

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
        setName("");
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
          className="flex-1 h-10 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 focus-visible:ring-violet-500/20 focus-visible:border-violet-500"
        />
        <Input
          placeholder="Customer email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1 h-10 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 focus-visible:ring-violet-500/20 focus-visible:border-violet-500"
        />
        <Button
          type="submit"
          disabled={!name.trim() || !email.trim() || result?.status === "sending"}
          className="h-10 px-5 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white shadow-sm font-medium"
        >
          {result?.status === "sending" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Send className="h-4 w-4 mr-1.5" />
              Send
            </>
          )}
        </Button>
      </div>

      {result && result.status !== "sending" && (
        <Alert
          variant={result.status === "error" ? "destructive" : "default"}
          className={
            result.status === "sent"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-zinc-200 dark:border-zinc-700"
          }
        >
          {result.status === "sent" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription className="text-sm">
            {result.message}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
