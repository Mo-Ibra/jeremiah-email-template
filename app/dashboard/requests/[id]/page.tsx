import { cookies } from "next/headers";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getSessionFromRequest } from "@/lib/auth/session";
import { getRequest } from "@/lib/db/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Star,
  Mail,
  Package,
  Clock,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  User,
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
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  rated: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  completed:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
};

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const businessId = await getBusinessId();
  if (!businessId) redirect("/login");

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
        <Link href="/dashboard/requests">
          <Button variant="ghost" size="sm" className="gap-1.5 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Request Detail
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-0.5 font-mono">
            {order.externalOrderId}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Customer */}
        <InfoCard
          title="Customer"
          icon={<User className="h-4 w-4" />}
          rows={[
            { label: "Name", value: customer.name },
            { label: "Email", value: customer.email },
          ]}
        />

        {/* Order */}
        <InfoCard
          title="Order"
          icon={<Package className="h-4 w-4" />}
          rows={[
            { label: "Order ID", value: order.externalOrderId, mono: true },
            {
              label: "Order date",
              value: order.orderDate
                ? new Date(order.orderDate).toLocaleDateString()
                : "—",
            },
          ]}
        />
      </div>

      {/* Rating & Feedback */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <Star className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Rating & Feedback
          </h3>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Status
            </span>
            <Badge
              variant="outline"
              className={`${statusStyles[status]} font-medium border`}
            >
              {status}
            </Badge>
          </div>
          <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              Rating
            </span>
            {r.rating ? (
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-4 w-4 ${
                      n <= r.rating!
                        ? "fill-amber-400 text-amber-400"
                        : "text-zinc-200 dark:text-zinc-700"
                    }`}
                  />
                ))}
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 ml-1">
                  {r.rating}/5
                </span>
              </div>
            ) : (
              <span className="text-sm text-zinc-300 dark:text-zinc-600">
                —
              </span>
            )}
          </div>
          <div className="h-px bg-zinc-100 dark:bg-zinc-800" />
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-zinc-500 dark:text-zinc-400 shrink-0">
              Feedback
            </span>
            {r.feedback ? (
              <p className="text-sm italic text-zinc-700 dark:text-zinc-300 text-right">
                &ldquo;{r.feedback}&rdquo;
              </p>
            ) : (
              <span className="text-sm text-zinc-300 dark:text-zinc-600">
                —
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Email Timeline */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
          <Clock className="h-4 w-4 text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Email Timeline
          </h3>
        </div>
        <div className="px-6 py-2">
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
            icon={<MessageSquare className="h-4 w-4" />}
            label="Feedback submitted"
            time={r.feedbackSubmittedAt}
          />
          <TimelineItem
            icon={<ExternalLink className="h-4 w-4" />}
            label="Redirected to Google review"
            time={r.googleReviewClickedAt}
            extra={
              r.googleReviewClickCount > 0
                ? `${r.googleReviewClickCount}×`
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: { label: string; value: React.ReactNode; mono?: boolean }[];
}) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <span className="text-zinc-400">{icon}</span>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
      </div>
      <div className="px-6 py-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {row.label}
            </span>
            <span
              className={`text-sm font-medium text-zinc-900 dark:text-zinc-100 ${row.mono ? "font-mono" : ""}`}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
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
    <div className="flex items-center gap-3 py-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${
          time
            ? danger
              ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
              : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
            : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {label}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {time ? new Date(time).toLocaleString() : "—"}
        </p>
        {extra && (
          <p className="text-xs text-red-500 font-medium">{extra}</p>
        )}
      </div>
    </div>
  );
}
