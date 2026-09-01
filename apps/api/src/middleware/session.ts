import type { Request, Response, NextFunction } from "express";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@swc-blogs/shared";
import { env } from "../lib/env.js";

/** Reads and verifies the shared session cookie, populating req.user. */
export async function sessionMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (token) {
    const claims = await verifySessionToken(token, env.SESSION_SECRET);
    if (claims) {
      req.user = { id: claims.sub, role: claims.role, clubId: claims.clubId };
    }
  }
  next();
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 6 * 60 * 60 * 1000,
    path: "/",
  });
}

/** Attribute options must match setSessionCookie's (minus maxAge) or the
 *  browser won't recognize this as clearing the same cookie. */
export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Half of the SSO CSRF check — the other half is the same nonce signed
 * into the OAuth state Microsoft echoes back (see auth.routes.ts's
 * /sso/login). Holding it in a cookie is what binds a callback to the
 * browser that actually started the login.
 *
 * sameSite "lax" specifically, not "strict": the callback arrives as a
 * top-level redirect from login.microsoftonline.com, and "strict" would
 * withhold the cookie on that cross-site navigation — the check would
 * then fail for every legitimate login. Lax sends it on exactly this
 * kind of top-level GET, which is the case being protected.
 */
const SSO_NONCE_MAX_AGE_MS = 10 * 60 * 1000; // matches the state token's TTL
export const SSO_NONCE_COOKIE_NAME = "swc_blogs_sso_nonce";

export function setSsoNonceCookie(res: Response, nonce: string) {
  res.cookie(SSO_NONCE_COOKIE_NAME, nonce, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SSO_NONCE_MAX_AGE_MS,
    path: "/",
  });
}

export function clearSsoNonceCookie(res: Response) {
  res.clearCookie(SSO_NONCE_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}
