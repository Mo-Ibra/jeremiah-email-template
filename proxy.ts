import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth/session";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect /dashboard/** but NOT /dashboard/login
  if (pathname.startsWith("/dashboard") && pathname !== "/dashboard/login") {
    const session = getSessionFromRequest(request);
    if (!session) {
      const loginUrl = new URL("/dashboard/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match /dashboard/** but NOT:
     * - /api (API routes)
     * - /_next/static, /_next/image (static files)
     * - favicon.ico, .png files
     */
    "/dashboard/:path*",
  ],
};
