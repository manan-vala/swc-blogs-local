import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@swc-blogs/db";
import { getSession } from "@/lib/session";
import { SignOutButton } from "@/components/admin/SignOutButton";

/**
 * Superadmin overview — design doc §7. 404s a non-superadmin rather
 * than redirecting to login: same reasoning as requireSuperadmin on
 * the API side (see apps/api/src/middleware/requireAuth.ts) — there's
 * no reason to confirm this panel exists to someone not cleared for it.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminOverviewPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPERADMIN") notFound();

  const admin = await prisma.user.findUniqueOrThrow({ where: { id: session.sub } });

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-neutral-500">Signed in as</p>
          <h1 className="text-2xl font-bold">{admin.name}</h1>
          <p className="text-sm text-neutral-500">{admin.email}</p>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-10 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
        The rest of the panel — whitelist, clubs, posts, sync logs, and
        other superadmin accounts — isn&apos;t built yet. The API routes
        already exist under <code className="font-mono text-xs">/api/admin</code>;
        this page is only the sign-in landing spot they&apos;ll be added to.
      </div>
    </main>
  );
}
