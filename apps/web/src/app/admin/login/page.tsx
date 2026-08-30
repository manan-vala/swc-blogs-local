import type { Metadata } from "next";

// Superadmin sign-in — design doc §7. Unlisted and unindexed, linked
// from nowhere on the public site. Password, then TOTP — two separate
// steps against /api/auth/admin/login and /api/auth/admin/verify-totp.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  // TODO: two-step form (password -> TOTP code) posting to the API's
  // auth routes. Generic failure copy only — "Incorrect email or
  // password" — never reveal which half was wrong (§7).
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-bold">SWC Blogs — Admin</h1>
      <p className="mt-2 text-sm text-neutral-600">Wire up the password + TOTP form here.</p>
    </main>
  );
}
