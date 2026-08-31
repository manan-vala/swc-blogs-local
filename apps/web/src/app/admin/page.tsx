import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@swc-blogs/db";
import { getSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Superadmin overview — design doc §7's "overview: pending items, recent
 * takedowns, health" route. 404s a non-superadmin rather than
 * redirecting: same reasoning as requireSuperadmin on the API side (see
 * apps/api/src/middleware/requireAuth.ts) — there's no reason to
 * confirm this panel exists to someone not cleared for it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminOverviewPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") notFound();

  const [admin, activeWhitelistCount, clubCount, postCounts, recentAudit] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.sub } }),
    prisma.whitelist.count({ where: { revokedAt: null } }),
    prisma.club.count(),
    prisma.post.groupBy({ by: ["status"], _count: true }),
    prisma.auditLog.findMany({
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const countByStatus = Object.fromEntries(postCounts.map((row) => [row.status, row._count]));

  const stats = [
    { label: "Active whitelist entries", value: activeWhitelistCount, href: "/admin/whitelist" },
    { label: "Clubs", value: clubCount, href: "/admin/clubs" },
    { label: "Published posts", value: countByStatus.PUBLISHED ?? 0, href: "/admin/posts?status=PUBLISHED" },
    { label: "Draft posts", value: countByStatus.DRAFT ?? 0, href: "/admin/posts?status=DRAFT" },
  ];

  return (
    <AdminShell active="/admin" adminEmail={admin.email}>
      <div>
        <p className="text-sm font-medium text-neutral-500">Signed in as</p>
        <h1 className="text-2xl font-bold">{admin.name}</h1>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-neutral-300"
          >
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="mt-1 text-xs text-neutral-500">{stat.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Recent privileged actions</h2>
          <Link href="/admin/audit" className="text-xs text-neutral-500 hover:underline">
            Full audit trail →
          </Link>
        </div>
        {recentAudit.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {recentAudit.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{entry.actor.name}</span>{" "}
                  <span className="text-neutral-500">{entry.action}</span>{" "}
                  <span className="text-neutral-400">
                    {entry.targetType}/{entry.targetId.slice(0, 8)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {entry.createdAt.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-10 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
        Health (Notion token validity, per-club sync status, media directory
        size) and Superadmins (a UI for managing other maintainer accounts)
        aren&apos;t built yet — a second superadmin can only be created via{" "}
        <code className="font-mono text-xs">create-superadmin</code> on the
        server for now.
      </div>
    </AdminShell>
  );
}
