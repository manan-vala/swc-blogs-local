import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";

// Superadmin sign-in — design doc §7. Unlisted and unindexed, linked
// from nowhere on the public site. Password, then TOTP or a backup
// code — two separate steps against the API's own two-step handshake.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  const session = await getSession();
  if (session?.role === "SUPERADMIN") redirect("/admin");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-bold">SWC Blogs — Admin</h1>
      <p className="mt-2 text-sm text-neutral-600">Sign in with your maintainer account.</p>
      <div className="mt-8">
        <AdminLoginForm />
      </div>
    </main>
  );
}
