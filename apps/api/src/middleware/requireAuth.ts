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

/** Any logged-in user — secretary or superadmin. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
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
export function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "SUPERADMIN") {
    return res.status(404).end();
  }
  next();
}

/** A club secretary acting only on their own club's resources. */
export function requireOwnClub(clubIdParam = "clubId") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not signed in." });
    if (req.user.role === "SUPERADMIN") return next(); // superadmin bypasses ownership
    const targetClubId = req.params[clubIdParam] ?? req.body?.clubId;
    if (req.user.clubId !== targetClubId) {
      return res.status(403).json({ error: "Not your club." });
    }
    next();
  };
}
