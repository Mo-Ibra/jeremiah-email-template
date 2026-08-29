import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromRequest } from "@/lib/auth/session";
import { listRequests, type ListFilters } from "@/lib/db/queries";
import { RequestFilters } from "@/components/dashboard/RequestFilters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

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
    "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  rated: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  completed:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const businessId = await getBusinessId();
  if (!businessId) redirect("/dashboard/login");

  const params = await searchParams;
  const filters: ListFilters = { perPage: 20, sort: "newest" };

  if (
    params.status === "pending" ||
    params.status === "rated" ||
    params.status === "completed"
  ) {
    filters.status = params.status;
  }
  if (params.search) filters.search = params.search;
  if (params.page) filters.page = Number(params.page) || 1;

  const result = await listRequests(businessId, filters);
  const totalPages = Math.ceil(result.total / result.perPage);

  function pageUrl(p: number) {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.search) sp.set("search", params.search);
    sp.set("page", String(p));
    return `/dashboard/requests?${sp.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Review Requests</h1>
        <p className="text-muted-foreground text-sm">
          {result.total} total request{result.total !== 1 ? "s" : ""}
        </p>
      </div>

      <RequestFilters />

      <Card>
        <CardContent className="p-0">
          {result.rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">
              No requests found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => {
                  const status = getStatus(r);
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {r.customerName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {r.customerEmail}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.externalOrderId}
                      </TableCell>
                      <TableCell>
                        {r.rating ? (
                          <div className="flex items-center gap-1">
                            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-medium">
                              {r.rating}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusStyles[status]}
                        >
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/requests/${r.id}`}>
                          <Button variant="ghost" size="sm">
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
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {result.page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={result.page <= 1}
            >
              {result.page > 1 ? (
                <Link href={pageUrl(result.page - 1)} className="flex items-center">
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={result.page >= totalPages}
            >
              {result.page < totalPages ? (
                <Link href={pageUrl(result.page + 1)} className="flex items-center">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
