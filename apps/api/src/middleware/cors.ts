import type { Request, Response, NextFunction } from "express";
import { env } from "../lib/env.js";

/**
 * See env.ts's DEV_CORS_ORIGIN doc comment — local-dev-only. A no-op
 * (falls straight to next()) whenever it's unset, which is every
 * production deployment.
 *
 * Deliberately hand-rolled rather than the `cors` package: one fixed
 * origin, credentials on, nothing dynamic — reflecting the request's
 * own Origin back is how a credentialed CORS response has to work
 * (Access-Control-Allow-Origin: * is rejected by browsers whenever
 * Allow-Credentials is true), but it's only ever compared against the
 * one configured origin, never trusted blindly.
 */
export function devCors(req: Request, res: Response, next: NextFunction) {
  if (!env.DEV_CORS_ORIGIN) return next();

  if (req.headers.origin === env.DEV_CORS_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", env.DEV_CORS_ORIGIN);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    return res.sendStatus(204);
  }

  next();
}
