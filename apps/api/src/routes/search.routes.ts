import { Router } from "express";
import { prisma } from "@swc-blogs/db";

/** Postgres tsvector full-text search — see design doc §5's migration. */
export const searchRouter = Router();

searchRouter.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  if (!q) return res.json([]);

  const results = await prisma.$queryRaw`
    SELECT id, title, slug, excerpt, "clubId"
    FROM "Post"
    WHERE search_vector @@ plainto_tsquery('english', ${q})
      AND status = 'PUBLISHED'
    ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
    LIMIT 20
  `;
  res.json(results);
});
