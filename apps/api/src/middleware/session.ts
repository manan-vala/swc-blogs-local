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
