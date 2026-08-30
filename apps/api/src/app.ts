import express from "express";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes.js";
import { postsRouter } from "./routes/posts.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { clubsRouter } from "./routes/clubs.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { sessionMiddleware } from "./middleware/session.js";

export function createApp() {
  const app = express();

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
