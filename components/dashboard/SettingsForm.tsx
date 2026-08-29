"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink, Building2, Globe } from "lucide-react";

export function SettingsForm() {
  const [name, setName] = useState("");
  const [googleReviewUrl, setGoogleReviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    status: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/settings")
      .then((r) => r.json())
      .then((data) => {
        setName(data.name ?? "");
        setGoogleReviewUrl(data.googleReviewUrl ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);

    try {
      const res = await fetch("/api/dashboard/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          googleReviewUrl: googleReviewUrl.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setName(data.name);
        setGoogleReviewUrl(data.googleReviewUrl);
        setResult({ status: "success", message: "Settings saved." });
      } else {
        setResult({
          status: "error",
          message: data.error?.message || "Failed to save",
        });
      }
    } catch {
      setResult({ status: "error", message: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Business
          </h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="name"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Business name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-10 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 focus-visible:ring-violet-500/20 focus-visible:border-violet-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <Globe className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Google Review
          </h3>
        </div>
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Customers who rate you 4-5 stars will see a &ldquo;Leave us a Google
            review&rdquo; button. Paste your Google review link here.
          </p>
          <div className="space-y-2">
            <Label
              htmlFor="googleReviewUrl"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Google review URL
            </Label>
            <Input
              id="googleReviewUrl"
              type="url"
              placeholder="https://search.google.com/local/writereview?placeid=..."
              value={googleReviewUrl}
              onChange={(e) => setGoogleReviewUrl(e.target.value)}
              className="h-10 bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 focus-visible:ring-violet-500/20 focus-visible:border-violet-500"
            />
          </div>
          {googleReviewUrl && (
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline font-medium"
            >
              Test link <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {result && (
        <Alert
          variant={result.status === "error" ? "destructive" : "default"}
          className={
            result.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
              : "border-zinc-200 dark:border-zinc-700"
          }
        >
          {result.status === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription className="text-sm">
            {result.message}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          className="h-10 px-6 bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 text-white shadow-sm font-medium"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Save changes
        </Button>
      </div>
    </form>
  );
}
