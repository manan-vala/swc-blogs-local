import express from "express";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes.js";
import { postsRouter } from "./routes/posts.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { clubsRouter } from "./routes/clubs.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { sessionMiddleware } from "./middleware/session.js";
import { devCors } from "./middleware/cors.js";

export function createApp() {
  const app = express();

  // Ahead of everything else: an OPTIONS preflight has to get its
  // Access-Control-* headers and 204 before any body/cookie parsing or
  // route matching ever sees it. No-ops entirely when DEV_CORS_ORIGIN
  // isn't set (every production deployment) — see cors.ts.
  app.use(devCors);

  app.use(express.json());
  app.use(cookieParser());
  // Verifies the shared JWT session cookie — also readable by apps/web
  // via @swc-blogs/shared's verifySessionToken (see packages/shared/src/session.ts).
  app.use(sessionMiddleware);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/admin", adminRouter); // requireSuperadmin applied inside
  app.use("/api/clubs", clubsRouter);
  app.use("/api/search", searchRouter);

  return app;
}
