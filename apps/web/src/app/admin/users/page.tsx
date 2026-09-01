import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@swc-blogs/db";
import { getSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { SuperadminsPanel, type AdminSuperadmin } from "@/components/admin/SuperadminsPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Design doc §7's "Superadmins" screen — the one panel screen that
 * manages access to every other one. Create, disable, rotate a
 * password, re-enrol TOTP, reissue backup codes; disable rather than
 * delete so the audit trail keeps its actor references (§5).
 */
export default async function AdminUsersPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") notFound();

  const [admin, admins] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.sub } }),
    prisma.user.findMany({
      where: { role: "SUPERADMIN" },
      include: { backupCodes: { where: { usedAt: null }, select: { id: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const serialized: AdminSuperadmin[] = admins.map((a) => ({
    id: a.id,
    email: a.email,
    name: a.name,
    isActive: a.isActive,
    isSelf: a.id === session.sub,
    lastLoginAt: a.lastLoginAt ? a.lastLoginAt.toISOString() : null,
    totpEnabledAt: a.totpEnabledAt ? a.totpEnabledAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    unusedBackupCodes: a.backupCodes.length,
  }));

  return (
    <AdminShell active="/admin/users" adminEmail={admin.email}>
      <h1 className="text-2xl font-bold">Superadmins</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Maintainer accounts — the same TOTP-mandatory enrolment as the bootstrap CLI, just from here.
        Keep at least two active accounts; a second maintainer is itself a recovery path (§7).
      </p>

      <SuperadminsPanel initialAdmins={serialized} />
    </AdminShell>
  );
}
