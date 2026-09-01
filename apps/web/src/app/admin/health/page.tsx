import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { prisma } from "@swc-blogs/db";
import { SESSION_COOKIE_NAME } from "@swc-blogs/shared";
import { getSession } from "@/lib/session";
import { API_BASE_INTERNAL } from "@/lib/api";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const RATE_LIMITED_CODE = "rate_limited"; // Notion SDK's APIErrorCode.RateLimited — see notion-sync.service.ts's classifyError

interface ApiHealth {
  notion: { ok: boolean; error: string | null };
  mediaDirBytes: number;
  checkedAt: string;
}

/** Server-side only — forwards this request's own session cookie to
 *  the API so its requireSuperadmin gate sees the same session this
 *  page already verified. Returns null on any failure (API down,
 *  network error) rather than throwing: the rest of the page's data is
 *  plain Postgres reads and shouldn't go dark because of this one call. */
async function fetchApiHealth(): Promise<ApiHealth | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE_INTERNAL}/admin/health`, {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ApiHealth;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

/**
 * Design doc §7's "Health" screen — "integration status at a glance."
 * Notion token validity and media directory size come from the API
 * (see health.service.ts, apps/api/src/routes/admin.routes.ts's
 * /health); everything else here is a direct Postgres read, same as
 * every other admin screen.
 */
export default async function AdminHealthPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") notFound();

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [admin, clubs, recentFailures, rateLimitedCount24h, apiHealth] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.sub } }),
    prisma.club.findMany({ orderBy: { name: "asc" } }),
    prisma.syncLog.findMany({
      where: { status: "FAILED" },
      include: { post: { include: { club: true } } },
      orderBy: { syncedAt: "desc" },
      take: 10,
    }),
    prisma.syncLog.count({ where: { errorCode: RATE_LIMITED_CODE, syncedAt: { gte: oneDayAgo } } }),
    fetchApiHealth(),
  ]);

  const perClub = await Promise.all(
    clubs.map(async (club) => ({
      club,
      latest: await prisma.syncLog.findFirst({
        where: { post: { clubId: club.id } },
        orderBy: { syncedAt: "desc" },
      }),
    }))
  );

  return (
    <AdminShell active="/admin/health" adminEmail={admin.email}>
      <h1 className="text-2xl font-bold">Health</h1>
      <p className="mt-1 text-sm text-neutral-500">Integration status at a glance — checked live on every load.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-neutral-500">Notion token</p>
          {apiHealth ? (
            <>
              <div className="mt-2">
                <Badge variant={apiHealth.notion.ok ? "success" : "critical"}>
                  {apiHealth.notion.ok ? "Valid" : "Invalid"}
                </Badge>
              </div>
              {apiHealth.notion.error && <p className="mt-2 text-xs text-red-700">{apiHealth.notion.error}</p>}
            </>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">Couldn&apos;t reach the API to check.</p>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-neutral-500">Media directory</p>
          <p className="mt-2 text-2xl font-bold">{apiHealth ? formatBytes(apiHealth.mediaDirBytes) : "—"}</p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-neutral-500">Rate-limited syncs, last 24h</p>
          <p className={`mt-2 text-2xl font-bold ${rateLimitedCount24h > 0 ? "text-amber-700" : ""}`}>
            {rateLimitedCount24h}
          </p>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="text-sm font-semibold text-neutral-700">Last sync per club</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Club</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {perClub.map(({ club, latest }) => (
                <tr key={club.id}>
                  <td className="px-4 py-2.5">{club.name}</td>
                  <td className="px-4 py-2.5">
                    {latest ? (
                      <Badge variant={latest.status === "SUCCESS" ? "success" : "critical"}>{latest.status}</Badge>
                    ) : (
                      <Badge variant="neutral">No posts synced yet</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500">
                    {latest ? latest.syncedAt.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
              {perClub.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-neutral-500">
                    No clubs yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-700">Recent sync failures</h2>
          <Link href="/admin/sync" className="text-xs text-neutral-500 hover:underline">
            Full sync log →
          </Link>
        </div>
        {recentFailures.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">None recorded.</p>
        ) : (
          <ul className="mt-3 divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
            {recentFailures.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{log.post.title}</span>{" "}
                  <span className="text-neutral-400">· {log.post.club.name}</span>
                  {log.message && <span className="block truncate text-xs text-neutral-500">{log.message}</span>}
                </span>
                <span className="shrink-0 text-xs text-neutral-400">{log.syncedAt.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminShell>
  );
}
