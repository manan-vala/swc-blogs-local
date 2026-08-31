import type { Request, Response, NextFunction } from "express";

/** Populated by the session middleware once wired up. */
export interface SessionUser {
  id: string;
  role: "SUPERADMIN" | "CLUB_SECY";
  clubId: string | null;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

/**
 * Each guard below is generic over the route's param type rather than
 * annotating the bare `Request`. Express 5 derives a route's params from
 * its path literal ("/:id/publish" -> { id: string }), but every handler
 * in the chain has to agree on that type — a middleware pinned to the
 * default `Request` widens it back to ParamsDictionary, whose values are
 * `string | string[]`, for the route's own handler too. Staying generic
 * keeps `req.params.id` a plain string wherever these are mounted.
 */

/** Any logged-in user — secretary or superadmin. */
export function requireAuth<P>(req: Request<P>, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Not signed in." });
  }
  next();
}

/**
 * Superadmin-only. Deliberately 404s a non-superadmin instead of 403 —
 * see design doc §7: no reason to confirm the admin panel exists to
 * someone who isn't cleared to use it.
 */
export function requireSuperadmin<P>(req: Request<P>, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "SUPERADMIN") {
    return res.status(404).end();
  }
  next();
}

/** A club secretary acting only on their own club's resources. */
export function requireOwnClub(clubIdParam = "clubId") {
  return <P>(req: Request<P>, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not signed in." });
    if (req.user.role === "SUPERADMIN") return next(); // superadmin bypasses ownership

    // The param name is chosen by the caller, so it can't be looked up
    // against a route's statically-known param type.
    const params = req.params as Record<string, string | string[] | undefined>;
    const targetClubId = params[clubIdParam] ?? req.body?.clubId;

    if (req.user.clubId !== targetClubId) {
      return res.status(403).json({ error: "Not your club." });
    }
    next();
  };
}
