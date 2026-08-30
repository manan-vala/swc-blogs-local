import { Router } from "express";
import { superadminLoginSchema, totpVerifySchema, signSessionToken } from "@swc-blogs/shared";
import { prisma } from "@swc-blogs/db";
import { authRateLimit } from "../middleware/rateLimit.js";
import { setSessionCookie } from "../middleware/session.js";
import { verifyPassword, verifyTotpCode, decryptTotpSecret } from "../services/auth.service.js";
import { env } from "../lib/env.js";

export const authRouter = Router();

/**
 * Club secretary sign-in. SSO redirect → callback → email checked
 * against Whitelist → session issued with role + club (§7, step 1).
 * Wire to the institute's actual SSO/CAS provider here.
 */
authRouter.get("/sso/login", (_req, res) => {
  // TODO: redirect to SSO_CLIENT_ID's authorize endpoint.
  res.status(501).json({ error: "SSO integration not yet wired." });
});

authRouter.get("/sso/callback", async (req, res) => {
  // TODO: exchange code, extract email from the SSO profile.
  const email = req.query.email as string | undefined; // placeholder
  if (!email) return res.status(400).json({ error: "No email from SSO." });

  const entry = await prisma.whitelist.findFirst({
    where: { email, revokedAt: null },
  });
  if (!entry) {
    // Not whitelisted — public site access only, no session issued.
    return res.redirect("/blogs?notice=not-whitelisted");
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: email.split("@")[0]!,
      role: "CLUB_SECY",
      provider: "SSO",
      clubId: entry.clubId,
    },
    update: { lastLoginAt: new Date(), clubId: entry.clubId },
  });

  const token = await signSessionToken(
    { sub: user.id, role: user.role, clubId: user.clubId },
    env.SESSION_SECRET
  );
  setSessionCookie(res, token);
  res.redirect("/blogs/dashboard");
});

/**
 * Superadmin sign-in — email + password, then TOTP. Break-glass path,
 * independent of SSO (§7). Rate-limited on both steps; account-level
 * lockout via User.failedLogins/lockedUntil layers on top of this.
 */
authRouter.post("/admin/login", authRateLimit, async (req, res) => {
  const parsed = superadminLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  // Generic failure copy — never reveal which half was wrong (§7).
  const fail = () => res.status(401).json({ error: "Incorrect email or password." });

  if (!user || user.role !== "SUPERADMIN" || !user.isActive || !user.passwordHash) return fail();
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return res.status(423).json({ error: "Account temporarily locked. Try again later." });
  }

  const valid = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!valid) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: { increment: 1 } },
    });
    return fail();
  }

  // Password correct — issue a short-lived pending-2FA token, not a full session.
  res.json({ pendingUserId: user.id, totpRequired: true });
});

authRouter.post("/admin/verify-totp", authRateLimit, async (req, res) => {
  const parsed = totpVerifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input." });

  const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
  if (!user || !user.totpSecret) return res.status(401).json({ error: "Invalid code." });

  const secret = decryptTotpSecret(user.totpSecret);
  const { valid, step } = verifyTotpCode(secret, parsed.data.code, user.totpLastStep);
  if (!valid) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: { increment: 1 } } });
    return res.status(401).json({ error: "Invalid code." });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpLastStep: step, failedLogins: 0, lastLoginAt: new Date() },
  });

  // Separate short-lived session from the SSO cookie — own name, own TTL (§7).
  const token = await signSessionToken(
    { sub: user.id, role: user.role, clubId: null },
    env.SESSION_SECRET
  );
  setSessionCookie(res, token);
  res.json({ ok: true });
});
