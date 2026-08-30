import { cookies } from "next/headers";
import { verifySessionToken, SESSION_COOKIE_NAME, type SessionClaims } from "@swc-blogs/shared";

/**
 * Server-only — reads the session cookie the API issued and verifies
 * it with the same SESSION_SECRET (design doc §4/§7: the second
 * cross-service seam, alongside the revalidate call). Use only inside
 * Server Components and Route Handlers.
 */
export async function getSession(): Promise<SessionClaims | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set — apps/web needs the same value as apps/api.");
  }
  return verifySessionToken(token, secret);
}
