import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionFromRequest } from "@/lib/auth/session";
import { listRequests, type ListFilters } from "@/lib/db/queries";
import { RequestFilters } from "@/components/dashboard/RequestFilters";
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
import { Star, ChevronLeft, ChevronRight, Eye } from "lucide-react";

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
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Review Requests
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">
          {result.total} total request{result.total !== 1 ? "s" : ""}
        </p>
      </div>

      <RequestFilters />

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm overflow-hidden">
        {result.rows.length === 0 ? (
          <p className="text-center text-zinc-400 dark:text-zinc-500 py-12 text-sm">
            No requests found.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-zinc-200 dark:border-zinc-800">
                  <TableHead className="text-zinc-500 dark:text-zinc-400 font-medium text-xs uppercase tracking-wider">
                    Customer
                  </TableHead>
                  <TableHead className="text-zinc-500 dark:text-zinc-400 font-medium text-xs uppercase tracking-wider">
                    Order
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
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((r) => {
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
                      <TableCell className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">
                        {r.externalOrderId}
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Page {result.page} of {totalPages}
                </p>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={result.page <= 1}
                    className="h-8 w-8 p-0 border-zinc-200 dark:border-zinc-700"
                  >
                    {result.page > 1 ? (
                      <Link href={pageUrl(result.page - 1)} className="flex items-center justify-center w-full h-full">
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
                    className="h-8 w-8 p-0 border-zinc-200 dark:border-zinc-700"
                  >
                    {result.page < totalPages ? (
                      <Link href={pageUrl(result.page + 1)} className="flex items-center justify-center w-full h-full">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
