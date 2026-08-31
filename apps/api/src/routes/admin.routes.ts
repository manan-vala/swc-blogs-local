import { Router } from "express";
import { prisma } from "@swc-blogs/db";
import { whitelistAddSchema, createClubSchema, updateClubSchema } from "@swc-blogs/shared";
import { requireSuperadmin } from "../middleware/requireAuth.js";
import { syncPost } from "../services/notion-sync.service.js";

/**
 * Superadmin panel routes — design doc §7. Everything here is gated by
 * requireSuperadmin, which 404s a non-superadmin rather than 403ing —
 * no reason to confirm this surface exists to someone not cleared for it.
 */
export const adminRouter = Router();
adminRouter.use(requireSuperadmin);

// --- Whitelist ---

adminRouter.get("/whitelist", async (_req, res) => {
  const entries = await prisma.whitelist.findMany({
    include: { club: true, addedBy: true },
    orderBy: { addedAt: "desc" },
  });
  res.json(entries);
});

adminRouter.post("/whitelist", async (req, res) => {
  const parsed = whitelistAddSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const entry = await prisma.whitelist.create({
    data: { ...parsed.data, addedById: req.user!.id },
  });
  await audit(req.user!.id, "whitelist.add", "Whitelist", entry.id, { email: entry.email }, req.ip);
  res.status(201).json(entry);
});

adminRouter.delete("/whitelist/:id", async (req, res) => {
  const entry = await prisma.whitelist.update({
    where: { id: req.params.id },
    data: { revokedAt: new Date() }, // revoke, don't delete (§5)
  });
  await audit(req.user!.id, "whitelist.revoke", "Whitelist", entry.id, null, req.ip);
  res.json(entry);
});

// --- Clubs ---

adminRouter.post("/clubs", async (req, res) => {
  const parsed = createClubSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });
  const club = await prisma.club.create({ data: parsed.data });
  await audit(req.user!.id, "club.create", "Club", club.id, null, req.ip);
  res.status(201).json(club);
});

adminRouter.patch("/clubs/:id", async (req, res) => {
  const parsed = updateClubSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });
  if (Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: "Nothing to update." });
  }
  const club = await prisma.club.update({ where: { id: req.params.id }, data: parsed.data });
  await audit(req.user!.id, "club.update", "Club", club.id, parsed.data, req.ip);
  res.json(club);
});

// --- Posts: the takedown path that replaces pre-publish review ---

adminRouter.post("/posts/:id/unpublish", async (req, res) => {
  const post = await prisma.post.update({
    where: { id: req.params.id },
    data: { status: "ARCHIVED" },
  });
  await audit(req.user!.id, "post.takedown", "Post", post.id, null, req.ip);
  res.json(post);
});

/** Force a re-sync outside the author's own publish/update flow — e.g.
 *  after fixing a stuck integration, without waiting for the next edit
 *  in Notion. Uses the same syncPost path as everything else, so a
 *  forced sync can't drift from what a normal publish would produce. */
adminRouter.post("/posts/:id/resync", async (req, res) => {
  const result = await syncPost(req.params.id!, "admin");
  if (!result.ok) return res.status(422).json({ error: result.error });
  await audit(req.user!.id, "post.resync", "Post", req.params.id!, null, req.ip);
  const post = await prisma.post.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json(post);
});

// --- Sync logs: full history lives here only (§9) ---

adminRouter.get("/sync-logs", async (req, res) => {
  const postId = req.query.postId as string | undefined;
  const logs = await prisma.syncLog.findMany({
    where: postId ? { postId } : undefined,
    orderBy: { syncedAt: "desc" },
    take: 200,
  });
  res.json(logs);
});

// --- Audit trail ---

adminRouter.get("/audit", async (_req, res) => {
  const entries = await prisma.auditLog.findMany({
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(entries);
});

async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  detail: object | null,
  ip: string | undefined
) {
  await prisma.auditLog.create({
    data: { actorId, action, targetType, targetId, detail: detail ?? undefined, ip },
  });
}
