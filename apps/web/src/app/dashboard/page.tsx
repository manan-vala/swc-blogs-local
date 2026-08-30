import { redirect } from "next/navigation";
import { prisma } from "@swc-blogs/db";
import { getSession } from "@/lib/session";
import { API_BASE } from "@/lib/api";
import { NewPostButton } from "@/components/dashboard/NewPostButton";
import { PostCard, type DashboardPost } from "@/components/dashboard/PostCard";

// Dynamic, auth-gated — design doc §9. Author's posts, publish/update
// actions, and a brief inline reason next to any post whose last sync
// failed (§9 "Error reporting to authors") — never a log panel; the
// full SyncLog history stays admin-only.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session || session.role !== "CLUB_SECY" || !session.clubId) {
    redirect(`${API_BASE}/auth/sso/login`);
  }

  const [club, posts] = await Promise.all([
    prisma.club.findUniqueOrThrow({ where: { id: session.clubId } }),
    prisma.post.findMany({
      where: { clubId: session.clubId },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  // Date objects aren't serializable across the server/client boundary
  // (Next.js RSC payloads are JSON-shaped) — convert before handing
  // these off to the client PostCard component.
  const dashboardPosts: DashboardPost[] = posts.map((post) => ({
    id: post.id,
    title: post.title,
    notionPageId: post.notionPageId,
    status: post.status,
    accentColor: post.accentColor,
    pattern: post.pattern,
    lastError: post.lastError,
    lastSyncedAt: post.lastSyncedAt ? post.lastSyncedAt.toISOString() : null,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-500">{club.name}</p>
          <h1 className="text-2xl font-bold">My posts</h1>
        </div>
        <NewPostButton />
      </div>

      {dashboardPosts.length === 0 ? (
        <p className="mt-12 text-neutral-500">No posts yet — start one above.</p>
      ) : (
        <div className="mt-8 space-y-4">
          {dashboardPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </main>
  );
}
