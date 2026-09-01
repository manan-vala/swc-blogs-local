import { Router } from "express";
import QRCode from "qrcode";
import { prisma, Prisma } from "@swc-blogs/db";
import {
  whitelistAddSchema,
  createClubSchema,
  updateClubSchema,
  superadminCreateStartSchema,
  superadminEnrollVerifySchema,
  resetSuperadminPasswordSchema,
  signSuperadminEnrollToken,
  verifySuperadminEnrollToken,
  type SuperadminEnrollClaims,
} from "@swc-blogs/shared";
import { requireSuperadmin } from "../middleware/requireAuth.js";
import { syncPost } from "../services/notion-sync.service.js";
import { env } from "../lib/env.js";
import {
  hashPassword,
  generateTotpSecret,
  totpKeyUri,
  verifyTotpCode,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  hashBackupCode,
} from "../services/auth.service.js";

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

// --- Superadmins: managing other maintainer accounts (§7) ---
//
// Create and re-enrol TOTP both go through the same start -> verify
// handshake the CLI already uses interactively (see
// cli/create-superadmin.ts) — a secret is generated and shown as a QR
// code, and nothing is written to User until one live code against
// that exact secret comes back. The signed enrollToken (see
// packages/shared/src/session.ts) IS the pending state between the two
// calls; there's no separate "in-progress enrolment" table for it.

adminRouter.get("/superadmins", async (_req, res) => {
  const admins = await prisma.user.findMany({
    where: { role: "SUPERADMIN" },
    select: {
      id: true,
      email: true,
      name: true,
      isActive: true,
      lastLoginAt: true,
      totpEnabledAt: true,
      createdAt: true,
      backupCodes: { where: { usedAt: null }, select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json(
    admins.map(({ backupCodes, ...rest }) => ({ ...rest, unusedBackupCodes: backupCodes.length }))
  );
});

async function startEnrollment(claims: Omit<SuperadminEnrollClaims, "encryptedSecret">) {
  const secret = generateTotpSecret();
  const otpauthUri = totpKeyUri(secret, claims.email);
  const [enrollToken, qrDataUrl] = await Promise.all([
    signSuperadminEnrollToken({ ...claims, encryptedSecret: encryptTotpSecret(secret) }, env.SESSION_SECRET),
    QRCode.toDataURL(otpauthUri),
  ]);
  return { enrollToken, qrDataUrl, secret, otpauthUri };
}

/** Step 1 of creating a superadmin: nothing written yet, just a QR code
 *  and a token carrying everything needed to finish once a live code
 *  verifies (see /superadmins/enroll/verify below). */
adminRouter.post("/superadmins", async (req, res) => {
  const parsed = superadminCreateStartSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return res.status(409).json({ error: "That email is already in use." });

  const enrollment = await startEnrollment({
    mode: "create",
    targetUserId: null,
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password),
  });
  res.json(enrollment);
});

/** Step 1 of re-enrolling TOTP for an existing superadmin — e.g. after
 *  a lost phone. Password and backup codes are untouched; reissue those
 *  separately if the phone loss took the codes with it too. */
adminRouter.post("/superadmins/:id/reenroll-totp", async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || target.role !== "SUPERADMIN") return res.status(404).json({ error: "Not found." });

  const enrollment = await startEnrollment({
    mode: "reenroll",
    targetUserId: target.id,
    email: target.email,
    name: target.name,
    passwordHash: null,
  });
  res.json(enrollment);
});

/** Step 2, shared by both flows above — §7's mandatory live-code check.
 *  The token says which flow this is; the client can't redirect a
 *  reenrollment onto a different account by editing anything it sends. */
adminRouter.post("/superadmins/enroll/verify", async (req, res) => {
  const parsed = superadminEnrollVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const claims = await verifySuperadminEnrollToken(parsed.data.enrollToken, env.SESSION_SECRET);
  if (!claims) return res.status(401).json({ error: "This enrolment link has expired — start again." });

  const secret = decryptTotpSecret(claims.encryptedSecret);
  const result = verifyTotpCode(secret, parsed.data.code, null);
  if (!result.valid) {
    return res.status(401).json({ error: "That code didn't verify — check the time on your device." });
  }

  if (claims.mode === "create") {
    const backupCodes = generateBackupCodes();
    const codeHashes = await Promise.all(backupCodes.map(hashBackupCode));

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: claims.email,
          name: claims.name,
          role: "SUPERADMIN",
          provider: "PASSWORD",
          passwordHash: claims.passwordHash!, // always set for "create" — see startEnrollment's caller
          passwordSetAt: new Date(),
          totpSecret: claims.encryptedSecret,
          totpEnabledAt: new Date(),
          totpLastStep: result.step,
          backupCodes: { create: codeHashes.map((codeHash) => ({ codeHash })) },
        },
      });
    } catch (err) {
      // The email raced another enrolment between start and verify.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return res.status(409).json({ error: "That email is already in use — start again." });
      }
      throw err;
    }

    await audit(req.user!.id, "superadmin.create", "User", user.id, { email: user.email }, req.ip);
    // Same rule as the CLI: backup codes are shown exactly once, right now.
    res.status(201).json({ id: user.id, email: user.email, name: user.name, backupCodes });
  } else {
    const user = await prisma.user.update({
      where: { id: claims.targetUserId! },
      data: { totpSecret: claims.encryptedSecret, totpEnabledAt: new Date(), totpLastStep: result.step },
    });
    await audit(req.user!.id, "superadmin.reenroll-totp", "User", user.id, null, req.ip);
    res.json({ id: user.id, email: user.email, name: user.name });
  }
});

/** Disable, don't delete — §7: keeps the audit trail's actor references
 *  intact. Blocked against your own account: there's no other superadmin
 *  action that un-disables you, so a stray click here is unrecoverable
 *  without CLI/SSH access, exactly the dependency the panel exists to
 *  avoid for routine account management. */
adminRouter.post("/superadmins/:id/disable", async (req, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: "You can't disable your own account." });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || target.role !== "SUPERADMIN") return res.status(404).json({ error: "Not found." });

  const user = await prisma.user.update({ where: { id: target.id }, data: { isActive: false } });
  await audit(req.user!.id, "superadmin.disable", "User", user.id, null, req.ip);
  res.json({ id: user.id, isActive: user.isActive });
});

adminRouter.post("/superadmins/:id/enable", async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || target.role !== "SUPERADMIN") return res.status(404).json({ error: "Not found." });

  const user = await prisma.user.update({
    where: { id: target.id },
    data: { isActive: true, failedLogins: 0, lockedUntil: null }, // a clean slate, not just the flag flipped
  });
  await audit(req.user!.id, "superadmin.enable", "User", user.id, null, req.ip);
  res.json({ id: user.id, isActive: user.isActive });
});

/** The value the acting superadmin types here has to be relayed to the
 *  target out of band — same as the CLI's reset path, just run by
 *  another maintainer instead of whoever has server access (§7: "no
 *  public password reset by design"). */
adminRouter.post("/superadmins/:id/reset-password", async (req, res) => {
  const parsed = resetSuperadminPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || target.role !== "SUPERADMIN") return res.status(404).json({ error: "Not found." });

  const user = await prisma.user.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(parsed.data.password),
      passwordSetAt: new Date(),
      failedLogins: 0,
      lockedUntil: null,
    },
  });
  await audit(req.user!.id, "superadmin.reset-password", "User", user.id, null, req.ip);
  res.json({ id: user.id });
});

/** Old codes are void the instant new ones are issued — same as the
 *  CLI, never leave two valid sets outstanding for one account. */
adminRouter.post("/superadmins/:id/reissue-backup-codes", async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target || target.role !== "SUPERADMIN") return res.status(404).json({ error: "Not found." });

  const backupCodes = generateBackupCodes();
  const codeHashes = await Promise.all(backupCodes.map(hashBackupCode));

  await prisma.$transaction([
    prisma.backupCode.deleteMany({ where: { userId: target.id } }),
    prisma.backupCode.createMany({ data: codeHashes.map((codeHash) => ({ userId: target.id, codeHash })) }),
  ]);
  await audit(req.user!.id, "superadmin.reissue-backup-codes", "User", target.id, null, req.ip);
  // Shown exactly once, same rule as enrolment.
  res.json({ backupCodes });
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
