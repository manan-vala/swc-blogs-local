import Link from "next/link";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./SignOutButton";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/whitelist", label: "Whitelist" },
  { href: "/admin/clubs", label: "Clubs" },
  { href: "/admin/posts", label: "Posts" },
  { href: "/admin/sync", label: "Sync logs" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/users", label: "Superadmins" },
] as const;

/**
 * Shared chrome for every gated /admin/* screen — design doc §7's
 * panel route list. Each page still does its own `notFound()` gate
 * (see admin/page.tsx) before rendering this; the shell itself has no
 * auth logic, it's just layout, so it can't become a place that gate
 * gets forgotten.
 */
export function AdminShell({
  active,
  adminEmail,
  children,
}: {
  active: (typeof NAV)[number]["href"];
  adminEmail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <nav className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active === item.href
                    ? "bg-neutral-900 text-white"
                    : "text-neutral-600 hover:bg-neutral-100"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-neutral-500 sm:inline">{adminEmail}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
