import { cookies } from "next/headers";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getRequest } from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Star,
  Mail,
  Package,
  Clock,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function getBusinessId() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  if (!sessionCookie) return null;
  const fakeReq = {
    headers: {
      get: (h: string) =>
        h === "cookie" ? `session=${sessionCookie.value}` : null,
    },
  };
  const session = getSessionFromRequest(fakeReq as Request);
  return session?.businessId ?? null;
}

const statusStyles: Record<string, string> = {
  pending:
    "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  rated: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  completed:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const businessId = await getBusinessId();
  if (!businessId) redirect("/dashboard/login");

  const result = await getRequest(id);
  if (!result || result.request.businessId !== businessId) notFound();

  const { request: r, customer, order } = result;
  const status = r.feedbackSubmittedAt
    ? "completed"
    : r.ratingSubmittedAt
      ? "rated"
      : "pending";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm">
          <Link href="/dashboard/requests" className="flex items-center">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Request Detail</h1>
          <p className="text-muted-foreground text-sm">
            {order.externalOrderId}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Customer */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <InfoRow label="Name" value={customer.name} />
            <InfoRow label="Email" value={customer.email} />
          </CardContent>
        </Card>

        {/* Order */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              Order
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <InfoRow label="Order ID" value={order.externalOrderId} />
            <InfoRow
              label="Order date"
              value={
                order.orderDate
                  ? new Date(order.orderDate).toLocaleDateString()
                  : "—"
              }
            />
          </CardContent>
        </Card>
      </div>

      {/* Rating & Feedback */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Star className="h-4 w-4 text-muted-foreground" />
            Rating & Feedback
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="outline" className={statusStyles[status]}>
              {status}
            </Badge>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Rating</span>
            {r.rating ? (
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-4 w-4 ${
                      n <= r.rating!
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                ))}
                <span className="text-sm font-medium ml-1">{r.rating}/5</span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Feedback</span>
            {r.feedback ? (
              <p className="text-sm italic text-right max-w-xs">
                &ldquo;{r.feedback}&rdquo;
              </p>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Email Timeline
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <TimelineItem
            icon={<Mail className="h-4 w-4" />}
            label="Email sent"
            time={r.emailSentAt}
          />
          <TimelineItem
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Email opened"
            time={r.emailOpenedAt}
          />
          <TimelineItem
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Delivered"
            time={r.emailDeliveredAt}
          />
          <TimelineItem
            icon={<XCircle className="h-4 w-4" />}
            label="Bounced"
            time={r.emailBouncedAt}
            danger
          />
          <TimelineItem
            icon={<MessageSquare className="h-4 w-4" />}
            label="Feedback submitted"
            time={r.feedbackSubmittedAt}
          />
          <TimelineItem
            icon={<ExternalLink className="h-4 w-4" />}
            label="Google review clicked"
            time={r.googleReviewClickedAt}
            extra={
              r.googleReviewClickCount > 0
                ? `${r.googleReviewClickCount}×`
                : undefined
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function TimelineItem({
  icon,
  label,
  time,
  extra,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  time: Date | null;
  extra?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full ${
          time
            ? danger
              ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
              : "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
      </div>
      <div className="text-right">
        <p className="text-sm text-muted-foreground">
          {time ? new Date(time).toLocaleString() : "—"}
        </p>
        {extra && (
          <p className="text-xs text-red-500 font-medium">{extra}</p>
        )}
      </div>
    </div>
  );
}
