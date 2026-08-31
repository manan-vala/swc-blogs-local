import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@swc-blogs/db";
import { getSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Full SyncLog history — design doc §9/§7: lives here only. Authors
 * see just a one-line reason inline on their own dashboard instead.
 */
export default async function AdminSyncPage({ searchParams }: { searchParams: { postId?: string } }) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") notFound();

  const [admin, logs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.sub } }),
    prisma.syncLog.findMany({
      where: searchParams.postId ? { postId: searchParams.postId } : undefined,
      include: { post: { include: { club: true } } },
      orderBy: { syncedAt: "desc" },
      take: 200,
    }),
  ]);

  return (
    <AdminShell active="/admin/sync" adminEmail={admin.email}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sync logs</h1>
          <p className="mt-1 text-sm text-neutral-500">Most recent 200 attempts, across every club.</p>
        </div>
        {searchParams.postId && (
          <Link href="/admin/sync" className="text-xs text-neutral-500 hover:underline">
            Clear filter
          </Link>
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2 font-medium">Post</th>
              <th className="px-4 py-2 font-medium">Trigger</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Message</th>
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {logs.map((log) => (
              <tr key={log.id}>
                <td className="max-w-[16rem] truncate px-4 py-2.5">
                  <Link href={`/admin/posts?clubId=${log.post.clubId}`} className="hover:underline">
                    {log.post.title}
                  </Link>
                  <span className="text-neutral-400"> · {log.post.club.name}</span>
                </td>
                <td className="px-4 py-2.5 text-xs">{log.trigger}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={log.status === "SUCCESS" ? "success" : "critical"}>{log.status}</Badge>
                </td>
                <td className="max-w-xs truncate px-4 py-2.5 text-xs text-neutral-600">{log.message ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-neutral-500">
                  {log.durationMs != null ? `${log.durationMs}ms` : "—"}
                </td>
                <td className="px-4 py-2.5 text-xs text-neutral-500">{log.syncedAt.toLocaleString()}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  No sync attempts recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
