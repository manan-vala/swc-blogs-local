import { Router } from "express";
import { prisma } from "@swc-blogs/db";

export const clubsRouter = Router();

clubsRouter.get("/", async (_req, res) => {
  const clubs = await prisma.club.findMany({ orderBy: { name: "asc" } });
  res.json(clubs);
});

clubsRouter.get("/:slug", async (req, res) => {
  const club = await prisma.club.findUnique({ where: { slug: req.params.slug } });
  if (!club) return res.status(404).json({ error: "Club not found." });
  res.json(club);
});
