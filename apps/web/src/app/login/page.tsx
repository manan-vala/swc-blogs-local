import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { API_BASE } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * Club secretary sign-in — design doc §7 step 1. Readers need no
 * account, so this page exists only for the handful of people who
 * publish: one button, straight into institute SSO.
 *
 * A plain <a>, not a fetch — the whole point of /auth/sso/login is a
 * top-level browser navigation to login.microsoftonline.com, which
 * client-side JavaScript can neither perform nor improve on.
 */

const ERROR_COPY: Record<string, string> = {
  // §7's whitelist gate. The most likely real cause is a secretary
  // whose term ended, or a new one nobody has added yet — say who can
  // fix it, since the reader can't.
  "not-whitelisted":
    "That account isn't set up to publish yet. Ask SWC to add your institute email to your club, then try again.",
  expired: "That sign-in link expired before it completed. Please try again.",
  "sso-failed": "Institute sign-in didn't complete. Please try again, or contact SWC if it persists.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const session = await getSession();
  if (session?.role === "CLUB_SECY") redirect("/dashboard");
  if (session?.role === "SUPERADMIN") redirect("/admin");

  const { error, redirect: nextPath } = await searchParams;
  const message = error ? (ERROR_COPY[error] ?? ERROR_COPY["sso-failed"]!) : null;

  const loginHref = nextPath
    ? `${API_BASE}/auth/sso/login?redirect=${encodeURIComponent(nextPath)}`
    : `${API_BASE}/auth/sso/login`;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div>
        <p className="text-sm font-medium text-neutral-500">SWC Blogs</p>
        <h1 className="mt-1 text-2xl font-bold">Sign in to publish</h1>
        <p className="mt-2 text-sm text-neutral-600">
          For club and board secretaries at IIT Guwahati. Reading needs no account.
        </p>
      </div>

      {message && (
        <div className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {message}
        </div>
      )}

      <a
        href={loginHref}
        className="mt-8 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      >
        {/* Microsoft's four-square mark, inline rather than a remote asset:
            no network dependency on a login page, and no CSP exception. */}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="0" y="0" width="7" height="7" fill="#f25022" />
          <rect x="9" y="0" width="7" height="7" fill="#7fba00" />
          <rect x="0" y="9" width="7" height="7" fill="#00a4ef" />
          <rect x="9" y="9" width="7" height="7" fill="#ffb900" />
        </svg>
        Continue with institute account
      </a>

      <p className="mt-4 text-xs text-neutral-500">
        Uses your @iitg.ac.in Microsoft account. You&apos;ll be asked to sign in each time, even if
        you&apos;re already signed in elsewhere.
      </p>

      <Link href="/" className="mt-10 text-sm text-neutral-500 hover:underline">
        ← Back to the blog
      </Link>
    </main>
  );
}
