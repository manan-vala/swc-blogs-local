import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@swc-blogs/db";
import { getSession } from "@/lib/session";
import { AdminShell } from "@/components/admin/AdminShell";
import { ClubsPanel, type AdminClub } from "@/components/admin/ClubsPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminClubsPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") notFound();

  const [admin, clubs] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.sub } }),
    prisma.club.findMany({ orderBy: { name: "asc" } }),
  ]);

  const serialized: AdminClub[] = clubs.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    category: c.category,
    description: c.description,
    accentColor: c.accentColor,
    pattern: c.pattern,
  }));

  return (
    <AdminShell active="/admin/clubs" adminEmail={admin.email}>
      <h1 className="text-2xl font-bold">Clubs</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Name, slug, category, and the default accent/pattern a club&apos;s posts fall back to.
        Slug is frozen once created — it&apos;s load-bearing for the club&apos;s archive URL.
      </p>

      <ClubsPanel initialClubs={serialized} />
    </AdminShell>
  );
}
