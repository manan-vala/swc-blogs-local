import { SignJWT, jwtVerify } from "jose";

/**
 * Shared session token — signed and verified identically by apps/api
 * (issues it after SSO callback / TOTP verify) and apps/web (reads it
 * server-side to render the dashboard/admin panel). This is the second
 * cross-service seam the monorepo split creates, alongside the
 * revalidate call in §4 — without a shared verification path, only
 * Express would ever know who's logged in.
 *
 * A JWT (rather than replicating cookie-session's own serialization
 * format) is what makes "verify identically on both sides" cheap:
 * both just call jwtVerify with the same secret.
 */

export const SESSION_COOKIE_NAME = "swc_blogs_session";
export const SESSION_TTL_SECONDS = 6 * 60 * 60; // short-lived — separate from any SSO-side session (§7)

export interface SessionClaims {
  sub: string; // userId
  role: "SUPERADMIN" | "CLUB_SECY";
  clubId: string | null;
}

export async function signSessionToken(claims: SessionClaims, secret: string): Promise<string> {
  return new SignJWT({ role: claims.role, clubId: claims.clubId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

export async function verifySessionToken(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return {
      sub: payload.sub as string,
      role: payload.role as SessionClaims["role"],
      clubId: (payload.clubId as string | null) ?? null,
    };
  } catch {
    return null; // expired, malformed, or wrong secret — treat all identically
  }
}
