import Link from "next/link";
import { metrics, listRequests } from "@/lib/db/queries";
import { getSessionFromRequest } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Star,
  MessageSquare,
  Send,
  ArrowRight,
  TrendingUp,
  Eye,
} from "lucide-react";
import { TestEmailForm } from "@/components/dashboard/TestEmailForm";

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

function getStatus(r: {
  ratingSubmittedAt: Date | null;
  feedbackSubmittedAt: Date | null;
}) {
  if (r.feedbackSubmittedAt) return "completed";
  if (r.ratingSubmittedAt) return "rated";
  return "pending";
}

const statusStyles: Record<string, string> = {
  pending:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  rated: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  completed:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
};

const statIcons: Record<string, React.ReactNode> = {
  total: <Send className="h-5 w-5" />,
  rating: <Star className="h-5 w-5" />,
  feedback: <MessageSquare className="h-5 w-5" />,
  rate: <TrendingUp className="h-5 w-5" />,
};

export default async function DashboardOverview() {
  const businessId = await getBusinessId();
  if (!businessId) redirect("/login");

  const [m, recent] = await Promise.all([
    metrics(businessId),
    listRequests(businessId, { perPage: 10, sort: "newest" }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Overview
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          Your review system at a glance.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Requests"
          value={String(m.total)}
          icon={statIcons.total}
          color="violet"
        />
        <StatCard
          label="Avg Rating"
          value={m.avgRating ? `${m.avgRating}` : "—"}
          sub={m.avgRating ? "/ 5" : undefined}
          icon={statIcons.rating}
          color="amber"
        />
        <StatCard
          label="Feedback"
          value={String(m.feedbackSubmitted)}
          icon={statIcons.feedback}
          color="blue"
        />
        <StatCard
          label="Response Rate"
          value={`${m.responseRate}%`}
          icon={statIcons.rate}
          color="emerald"
        />
      </div>

      {/* Test email */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Send test email
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Creates a review request and sends the email. Use a real inbox to
            test the full flow.
          </p>
        </div>
        <div className="px-6 py-4">
          <TestEmailForm />
        </div>
      </div>

      {/* Recent requests */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm">
        <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Recent requests
          </h2>
          <Link href="/dashboard/requests">
            <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 gap-1.5">
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
        {recent.rows.length === 0 ? (
          <p className="text-center text-zinc-400 dark:text-zinc-500 py-12 text-sm">
            No requests yet. Send a test email above to get started.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-zinc-200 dark:border-zinc-800">
                <TableHead className="text-zinc-500 dark:text-zinc-400 font-medium text-xs uppercase tracking-wider">
                  Customer
                </TableHead>
                <TableHead className="text-zinc-500 dark:text-zinc-400 font-medium text-xs uppercase tracking-wider">
                  Rating
                </TableHead>
                <TableHead className="text-zinc-500 dark:text-zinc-400 font-medium text-xs uppercase tracking-wider">
                  Status
                </TableHead>
                <TableHead className="text-zinc-500 dark:text-zinc-400 font-medium text-xs uppercase tracking-wider text-right">
                  Date
                </TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.rows.map((r) => {
                const status = getStatus(r);
                return (
                  <TableRow
                    key={r.id}
                    className="border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                          {r.customerName}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {r.customerEmail}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.rating ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {r.rating}
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-300 dark:text-zinc-600 text-sm">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${statusStyles[status]} font-medium border`}
                      >
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-zinc-500 dark:text-zinc-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Link href={`/dashboard/requests/${r.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-3 text-xs font-medium border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          View
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: "violet" | "amber" | "blue" | "emerald";
}) {
  const colorMap = {
    violet: "from-violet-500 to-indigo-600",
    amber: "from-amber-400 to-orange-500",
    blue: "from-blue-500 to-cyan-500",
    emerald: "from-emerald-500 to-teal-500",
  };

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          {label}
        </span>
        <div
          className={`flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br ${colorMap[color]} shadow-sm`}
        >
          <span className="text-white">{icon}</span>
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          {value}
        </span>
        {sub && (
          <span className="text-sm text-zinc-400 dark:text-zinc-500 font-medium">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}
