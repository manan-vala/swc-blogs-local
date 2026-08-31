import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@swc-blogs/db";
import { getSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Every privileged action, written down — design doc §7's closing
 * argument for AuditLog: SWC's maintainers turn over every year, and
 * "who gave this person publish access, and when" needs an answer
 * that isn't tribal memory. Read-only by construction — nothing here
 * is ever edited or deleted.
 */
export default async function AdminAuditPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") notFound();

  const [admin, entries] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.sub } }),
    prisma.auditLog.findMany({
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  return (
    <AdminShell active="/admin/audit" adminEmail={admin.email}>
      <h1 className="text-2xl font-bold">Audit trail</h1>
      <p className="mt-1 text-sm text-neutral-500">Most recent 200 privileged actions. Nothing here is edited or deleted.</p>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Target</th>
              <th className="px-4 py-2 font-medium">Detail</th>
              <th className="px-4 py-2 font-medium">IP</th>
              <th className="px-4 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-2.5">
                  {entry.actor.name}
                  <span className="text-neutral-400"> · {entry.actor.email}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{entry.action}</td>
                <td className="px-4 py-2.5 text-xs text-neutral-600">
                  {entry.targetType}/{entry.targetId.slice(0, 8)}
                </td>
                <td className="max-w-xs truncate px-4 py-2.5 text-xs text-neutral-500">
                  {entry.detail ? JSON.stringify(entry.detail) : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-500">{entry.ip ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-neutral-500">{entry.createdAt.toLocaleString()}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  No privileged actions recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
