"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink } from "lucide-react";

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
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Business name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Customers who rate you 4-5 stars will see a &ldquo;Leave us a Google
            review&rdquo; button. Paste your Google review link here.
          </p>
          <div className="space-y-2">
            <Label htmlFor="googleReviewUrl">Google review URL</Label>
            <Input
              id="googleReviewUrl"
              type="url"
              placeholder="https://search.google.com/local/writereview?placeid=..."
              value={googleReviewUrl}
              onChange={(e) => setGoogleReviewUrl(e.target.value)}
            />
          </div>
          {googleReviewUrl && (
            <a
              href={googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Test link <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </CardContent>
      </Card>

      {result && (
        <Alert
          variant={result.status === "error" ? "destructive" : "default"}
          className={
            result.status === "success"
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
              : ""
          }
        >
          {result.status === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save changes
        </Button>
      </div>
    </form>
  );
}
