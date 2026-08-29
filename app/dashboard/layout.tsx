import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromRequest } from "@/lib/auth/session";
import { LayoutDashboard, Mail, Settings } from "lucide-react";

export const dynamic = "force-dynamic";

async function getSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");
  if (!sessionCookie) return null;
  const fakeReq = {
    headers: {
      get: (h: string) =>
        h === "cookie" ? `session=${sessionCookie.value}` : null,
    },
  };
  return getSessionFromRequest(fakeReq as Request);
}

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/requests", label: "Review Requests", icon: Mail },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/dashboard/login");

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:border-r border-border bg-card">
        <div className="flex items-center gap-2 px-6 h-14 border-b border-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            RS
          </div>
          <span className="font-semibold text-sm">Review System</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
              {session.email.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center h-14 px-4 border-b border-border bg-card lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              RS
            </div>
            <span className="font-semibold text-sm">Review System</span>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
