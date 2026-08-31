import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@swc-blogs/db";
import { getSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { WhitelistPanel, type WhitelistEntry } from "@/components/admin/WhitelistPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Design doc §7: "the core screen." addedAt/addedBy stay visible so a
 * stale entry (added by someone no longer a maintainer, years ago) is
 * obvious at a glance rather than needing a separate audit lookup.
 */
export default async function WhitelistPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") notFound();

  const [admin, entries, clubs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.sub } }),
    prisma.whitelist.findMany({
      include: { club: true, addedBy: true },
      orderBy: { addedAt: "desc" },
    }),
    prisma.club.findMany({ orderBy: { name: "asc" } }),
  ]);

  const serialized: WhitelistEntry[] = entries.map((e) => ({
    id: e.id,
    email: e.email,
    clubId: e.clubId,
    clubName: e.club.name,
    addedByName: e.addedBy?.name ?? null,
    addedAt: e.addedAt.toISOString(),
    revokedAt: e.revokedAt ? e.revokedAt.toISOString() : null,
  }));

  return (
    <AdminShell active="/admin/whitelist" adminEmail={admin.email}>
      <h1 className="text-2xl font-bold">Whitelist</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Only whitelisted emails are admitted at the institute SSO callback (§7). Revoke,
        don&apos;t delete — the audit trail keeps its references.
      </p>

      <WhitelistPanel
        initialEntries={serialized}
        clubs={clubs.map((c) => ({ id: c.id, name: c.name }))}
      />
    </AdminShell>
  );
}
