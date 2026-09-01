import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma, type Prisma } from "@swc-blogs/db";
import { getSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminPostsTable, type AdminPost } from "@/components/admin/AdminPostsTable";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

/**
 * Cross-club oversight — design doc §7: "the takedown path that
 * replaces pre-publish review." Every club's posts in one list, since
 * nothing else in the product gives a superadmin that view.
 */
export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; clubId?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") notFound();

  const { status, clubId } = await searchParams;
  const statusFilter = STATUSES.find((s) => s === status);
  const where: Prisma.PostWhereInput = {
    ...(statusFilter && { status: statusFilter }),
    ...(clubId && { clubId }),
  };

  const [admin, posts, clubs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.sub } }),
    prisma.post.findMany({
      where,
      include: { club: true, author: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.club.findMany({ orderBy: { name: "asc" } }),
  ]);

  const serialized: AdminPost[] = posts.map((post) => ({
    id: post.id,
    title: post.title,
    slug: post.slug,
    clubName: post.club.name,
    clubId: post.clubId,
    authorName: post.author.name,
    status: post.status,
    lastError: post.lastError,
    lastSyncedAt: post.lastSyncedAt ? post.lastSyncedAt.toISOString() : null,
    updatedAt: post.updatedAt.toISOString(),
  }));

  return (
    <AdminShell active="/admin/posts" adminEmail={admin.email}>
      <h1 className="text-2xl font-bold">Posts</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Every club, one list. Archive replaces pre-publish review as the takedown path (§8) — force a
        re-sync to pull the latest Notion content outside a normal author edit.
      </p>

      <AdminPostsTable
        initialPosts={serialized}
        clubs={clubs.map((c) => ({ id: c.id, name: c.name }))}
        activeStatus={statusFilter}
        activeClubId={clubId}
      />
    </AdminShell>
  );
}
